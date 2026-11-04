"""
记忆引擎 — AI 自动从对话中提取、存储、检索用户长记忆

工作流程：
1. 对话进行中 → 每 N 轮自动触发提取
2. 提取 → 调用 DeepSeek 从最近对话中识别用户关键信息
3. 存储 → 向量化后存入 MySQL + 向量索引
4. 检索 → 新问题时，向量检索最相关的记忆注入 context
5. 维护 → 定期合并相似记忆、清理过期低重要度记忆

核心原则：只记有价值的信息，不浪费存储和 token。
"""
import asyncio
import hashlib
import json
import logging
import math
import re
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from ..models import Memory, UserSettings, MemoryProvenance, ChatSession, ChatMessage
from .embedding import embed

logger = logging.getLogger(__name__)

# 保存 fire-and-forget 任务引用，避免被 GC 提前回收
_pending_tasks: set = set()

# ── 常量 ──
EXTRACT_TRIGGER_ROUNDS = 8           # 每 N 轮触发一次提取（原 100 几乎永不触发）
MEMORY_SIMILARITY_THRESHOLD = 0.85   # 相似度阈值（用于去重合并）
MAX_MEMORIES_PER_USER = 500          # 每用户最多记忆条数
OLD_DAYS = 90                        # 低重要度记忆过期天数
CONSOLIDATE_EVERY_N_EXTRACTS = 5     # 每提取 N 次自动整理一次记忆

# ── 记忆提取的提示词 ──
EXTRACTION_PROMPT = """请从以下对话中提取关于"用户"的关键信息。

要求：
1. 只提取用户相关的信息（偏好、事实、计划、背景），不要提取AI说的话
2. 每条信息用一行，格式：类型|内容|重要度(0-1)
   类型只能是：preference(偏好) / fact(事实) / plan(计划) / background(背景)
3. 只提取有价值、值得长期记住的信息。忽略寒暄、临时对话、无意义的闲聊
4. 重要度判断标准：
   - 0.8-1.0：核心偏好、个人信息、重要计划
   - 0.5-0.7：一般兴趣、偶尔提及的事实
   - 0.1-0.4：可能有用但不是关键的信息
5. 【去重要求】如果某条信息与已有记忆含义相近，不要重复提取。只提取新的、不同的信息
6. 【完整度】每条记忆应包含足够上下文，如"喜欢被温柔对待"优于"喜欢温柔"
7. 如果没有值得记忆的新信息，回复 "NONE"

已有记忆（避免重复）：
{existing_memories}

对话内容：
{conversation}

请严格按照格式回复（每条一行），不要添加额外解释："""


class MemoryEngine:
    """记忆引擎 — 管理 AI 长记忆的全生命周期"""

    def __init__(self, db_session_factory):
        """
        db_session_factory: 返回 SQLAlchemy Session 的可调用对象
        注意：不缓存 session，每次操作使用独立的 session 避免并发问题
        """
        self._get_db = db_session_factory
        self._extract_counts: dict[tuple[int, int], int] = {}

    @staticmethod
    def _safe_memories(db, user_id, session_id, memories):
        session = db.query(ChatSession).filter_by(id=session_id, user_id=user_id).first()
        if not session or not (session.parameters or {}).get('_recall_context_guard'):
            return memories
        ids = [m.id for m in memories]
        records = {p.memory_id: p.sources for p in db.query(MemoryProvenance).filter(MemoryProvenance.memory_id.in_(ids)).all()} if ids else {}
        source_ids = {item['id'] for sources in records.values() for item in (sources or [])}
        messages = {m.id: m for m in db.query(ChatMessage).filter(ChatMessage.session_id == session_id, ChatMessage.id.in_(source_ids)).all()} if source_ids else {}
        def safe(mem):
            if mem.id not in records:
                return False
            return all(item['id'] in messages and not (messages[item['id']].metadata_ or {}).get('recalled')
                       and hashlib.sha256(messages[item['id']].content.encode()).hexdigest() == item['hash']
                       for item in records[mem.id])
        return [mem for mem in memories if safe(mem)]

    # ═══════════════════════════════════════════════════════
    # 记忆提取
    # ═══════════════════════════════════════════════════════

    async def extract_and_store(
        self,
        user_id: int,
        session_id: int,
        messages: list[dict],
        llm_func,
    ) -> list[dict]:
        """
        从最近对话中提取记忆并存储。

        Args:
            user_id: 用户ID
            session_id: 会话ID
            messages: 最近的对话消息 [{"role": "user/assistant", "content": "..."}]
            llm_func: DeepSeek LLM 调用函数

        Returns:
            新提取的记忆列表
        """
        # 只取最近的用户和AI消息（不超过20条做提取）
        recent = messages[-20:]
        if len([m for m in recent if m["role"] == "user"]) < 2:
            return []  # 用户消息太少，不提取

        # 构建提取用的对话文本
        conversation_text = "\n".join([
            f"{'用户' if m['role'] == 'user' else 'AI'}: {m['content']}"
            for m in recent
        ])

        # 获取已有记忆摘要，避免重复提取
        existing_memories_text = ""
        try:
            db_preview = self._get_db()
            try:
                existing_mems = (
                    db_preview.query(Memory)
                    .filter(Memory.user_id == user_id, Memory.session_id == session_id)
                    .order_by(Memory.importance.desc())
                    .limit(50)
                    .all()
                )
                existing_mems = self._safe_memories(db_preview, user_id, session_id, existing_mems)
                if existing_mems:
                    existing_memories_text = "\n".join([
                        f"- {m.content}" for m in existing_mems
                    ])
            finally:
                db_preview.close()
        except Exception:
            pass

        # 调用 LLM 提取
        try:
            raw = await llm_func(
                prompt=EXTRACTION_PROMPT.format(
                    conversation=conversation_text,
                    existing_memories=existing_memories_text or "（暂无）"
                ),
                system_prompt="你是一个精准的信息提取器。只输出格式化的信息，不输出任何废话。",
            )
        except Exception as e:
            logger.error(f"记忆提取LLM调用失败: {e}")
            return []

        # 解析提取结果
        new_memories = self._parse_extraction(raw)
        if not new_memories:
            return []

        # 批量计算所有新记忆的向量（一次 API 调用替代 N 次）
        try:
            vectors = await asyncio.to_thread(embed, [m["content"] for m in new_memories])
        except Exception as e:
            logger.warning(f"批量嵌入失败，本次跳过向量去重: {e}")
            vectors = [None] * len(new_memories)

        # 去重 + 存储
        db = self._get_db()
        try:
            stored = []
            for mem, vec in zip(new_memories, vectors):
                # 用向量相似度检查是否与已有记忆重复（中文也准确）
                if self._is_duplicate(db, user_id, session_id, mem["content"], vec):
                    continue
                record = self._store_memory(db, user_id, session_id, mem, vec)
                source = [{'id': m['id'], 'hash': hashlib.sha256(m['content'].encode()).hexdigest()}
                          for m in recent if m.get('id') is not None]
                if source:
                    db.add(MemoryProvenance(memory_id=record['id'], sources=source))
                stored.append(record)
            db.commit()

            # 每隔一定次数自动整理记忆（合并相似 / 清理过期 / 控制上限）
            count_key = (user_id, session_id)
            self._extract_counts[count_key] = self._extract_counts.get(count_key, 0) + 1
            if self._extract_counts[count_key] % CONSOLIDATE_EVERY_N_EXTRACTS == 0:
                try:
                    cleaned = await self.consolidate(user_id, session_id)
                    if cleaned:
                        logger.info(f"自动整理记忆: user={user_id}, 清理={cleaned}")
                except Exception as e:
                    logger.warning(f"自动整理记忆失败: {e}")

            return stored
        except Exception as e:
            db.rollback()
            logger.error(f"记忆存储失败: {e}")
            return []
        finally:
            db.close()

    # ═══════════════════════════════════════════════════════
    # 记忆检索
    # ═══════════════════════════════════════════════════════

    async def retrieve_relevant(
        self,
        user_id: int,
        session_id: int,
        query: str,
        top_k: int = 5,
    ) -> list[dict]:
        """
        检索与当前问题最相关的记忆。

        策略：
        1. 向量检索（如果嵌入可用）— 语义匹配
        2. 关键词检索 — 字面匹配
        3. 按 (相似度 * 0.6 + 重要度 * 0.3 + 热度 * 0.1) 排序

        注意：不再按 importance 预筛选，否则低重要度但语义高度相关的
        记忆会被永久丢弃。取全部用户记忆（上限 MAX_MEMORIES_PER_USER）。
        """
        db = self._get_db()
        try:
            memories = (
                db.query(Memory)
                .filter(Memory.user_id == user_id, Memory.session_id == session_id)
                .order_by(Memory.created_at.asc())
                .limit(MAX_MEMORIES_PER_USER)  # 取全部，避免预筛选 bias
                .all()
            )

            memories = self._safe_memories(db, user_id, session_id, memories)
            if not memories:
                return []

            # 获取查询的向量
            try:
                query_vec = (await asyncio.to_thread(embed, [query]))[0]
            except Exception as e:
                logger.warning(f"嵌入查询失败: {e}")
                # 降级为关键词匹配
                return self._keyword_search(memories, query, top_k)

            # 计算余弦相似度 + 综合评分
            scored = []
            for mem in memories:
                if mem.embedding_id:
                    try:
                        mem_vec = json.loads(mem.embedding_id)  # 存储为JSON数组
                        similarity = self._cosine_sim(query_vec, mem_vec)
                    except (json.JSONDecodeError, TypeError):
                        similarity = self._keyword_score(mem.content, query)
                else:
                    similarity = self._keyword_score(mem.content, query)

                # 综合评分：相似度60% + 重要度30% + 热度10%
                heat = min(1.0, (mem.access_count or 0) / 20.0)  # 归一化热度
                composite = similarity * 0.6 + (mem.importance or 0.5) * 0.3 + heat * 0.1
                scored.append((composite, mem))

            # 排序取 top_k
            scored.sort(key=lambda x: x[0], reverse=True)
            results = []
            hit_ids: list[int] = []
            for score, mem in scored[:top_k]:
                if score < 0.3:  # 太低的不返回
                    continue
                hit_ids.append(mem.id)
                results.append({
                    "id": mem.id,
                    "content": mem.content,
                    "category": mem.category,
                    "importance": mem.importance,
                })

            # 访问计数异步更新（不在检索热路径 commit，避免与主事务冲突）
            if hit_ids:
                import asyncio as _asyncio
                from ..database import SessionLocal as _SL
                _hits = list(hit_ids)

                async def _bump_access():
                    _db = _SL()
                    try:
                        _now = datetime.now(timezone.utc)
                        for _mid in _hits:
                            _m = _db.query(Memory).filter(Memory.id == _mid).first()
                            if _m:
                                _m.access_count = (_m.access_count or 0) + 1
                                _m.last_accessed_at = _now
                        _db.commit()
                    except Exception as _e:
                        logger.warning(f"记忆访问计数更新失败: {_e}")
                        try:
                            _db.rollback()
                        except Exception:
                            pass
                    finally:
                        _db.close()
                _task = _asyncio.create_task(_bump_access())
                _pending_tasks.add(_task)
                _task.add_done_callback(_pending_tasks.discard)

            return results
        except Exception as e:
            logger.error(f"记忆检索失败: {e}")
            return []
        finally:
            db.close()

    # ═══════════════════════════════════════════════════════
    # 记忆管理
    # ═══════════════════════════════════════════════════════

    async def list_memories(self, user_id: int, session_id: int, category: str = None) -> list[dict]:
        """列出用户的所有记忆"""
        db = self._get_db()
        try:
            q = db.query(Memory).filter(Memory.user_id == user_id, Memory.session_id == session_id)
            if category:
                q = q.filter(Memory.category == category)
            memories = q.order_by(Memory.importance.desc(), Memory.created_at.desc()).limit(200).all()
            safe_ids = {m.id for m in self._safe_memories(db, user_id, session_id, memories)}
            ids = [m.id for m in memories]
            provenance = {p.memory_id: p.sources for p in db.query(MemoryProvenance).filter(MemoryProvenance.memory_id.in_(ids)).all()} if ids else {}
            return [
                {
                    "id": m.id,
                    "content": m.content,
                    "category": m.category,
                    "importance": m.importance,
                    "access_count": m.access_count or 0,
                    "created_at": m.created_at.isoformat() if m.created_at else None,
                    "source_message_ids": [source['id'] for source in provenance.get(m.id, [])],
                    "source_known": m.id in provenance,
                    "usable": m.id in safe_ids,
                }
                for m in memories
            ]
        finally:
            db.close()

    async def delete_memory(self, user_id: int, memory_id: int) -> bool:
        """删除单条记忆"""
        db = self._get_db()
        try:
            mem = db.query(Memory).filter(
                Memory.id == memory_id,
                Memory.user_id == user_id,
            ).first()
            if not mem:
                return False
            db.delete(mem)
            db.commit()
            return True
        except Exception as e:
            db.rollback()
            logger.error(f"删除记忆失败: {e}")
            return False
        finally:
            db.close()

    async def update_memory(self, user_id: int, memory_id: int, data: dict) -> bool:
        """更新记忆（内容、类型、重要度）"""
        db = self._get_db()
        try:
            mem = db.query(Memory).filter(
                Memory.id == memory_id,
                Memory.user_id == user_id,
            ).first()
            if not mem:
                return False
            if "content" in data:
                mem.content = data["content"]
            if "category" in data:
                mem.category = data["category"]
            if "importance" in data:
                mem.importance = data["importance"]
            db.commit()
            return True
        except Exception as e:
            db.rollback()
            logger.error(f"更新记忆失败: {e}")
            return False
        finally:
            db.close()

    async def consolidate(self, user_id: int, session_id: int) -> int:
        """
        合并相似记忆，清理过期记忆。
        返回清理/合并的记忆数量。
        """
        db = self._get_db()
        consolidated = 0
        try:
            memories = (
                db.query(Memory)
                .filter(Memory.user_id == user_id, Memory.session_id == session_id)
                .order_by(Memory.importance.asc())  # 低重要度的优先处理
                .all()
            )

            now = datetime.now(timezone.utc)
            seen = {}  # content_hash -> memory

            for mem in memories:
                # 清理过期低重要度记忆
                if (mem.importance or 0.5) < 0.3 and mem.created_at:
                    # created_at 可能是 naive datetime（SQLite），统一处理
                    created = mem.created_at
                    if created.tzinfo is None:
                        created = created.replace(tzinfo=timezone.utc)
                    age_days = (now - created).days
                    if age_days > OLD_DAYS and mem.access_count < 3:
                        db.delete(mem)
                        consolidated += 1
                        continue

                # 合并相似记忆（改进：结合指纹匹配和字符相似度）
                key = self._content_key(mem.content)
                merged_into = None
                for seen_key, seen_mem in seen.items():
                    # 指纹匹配
                    if seen_key == key:
                        merged_into = seen_mem
                        break
                    # 字符相似度匹配（捕获语义相近但指纹不同的记忆）
                    if self._text_similarity(mem.content, seen_mem.content) > 0.6:
                        merged_into = seen_mem
                        break
                if merged_into is not None:
                    # 合并：保留较新的、更新重要度
                    existing = merged_into
                    left_source = db.get(MemoryProvenance, existing.id)
                    right_source = db.get(MemoryProvenance, mem.id)
                    if left_source and right_source:
                        combined = {item['id']: item for item in (left_source.sources or []) + (right_source.sources or [])}
                        left_source.sources = list(combined.values())
                    elif left_source:
                        db.delete(left_source)  # 任一来源未知时，合并结果也视为未知。
                    if right_source:
                        db.delete(right_source)
                    existing.importance = max((existing.importance or 0.5), (mem.importance or 0.5))
                    existing.access_count = (existing.access_count or 0) + (mem.access_count or 0)
                    # 保留更详细的content
                    if len(mem.content) > len(existing.content):
                        existing.content = mem.content
                    db.delete(mem)
                    consolidated += 1
                else:
                    seen[key] = mem

            # 检查数量上限
            remaining = db.query(Memory).filter(Memory.user_id == user_id, Memory.session_id == session_id).count()
            if remaining > MAX_MEMORIES_PER_USER:
                # 删最旧最低重要度的
                overflow = remaining - MAX_MEMORIES_PER_USER
                to_delete = (
                    db.query(Memory)
                    .filter(Memory.user_id == user_id, Memory.session_id == session_id)
                    .order_by(Memory.importance.asc(), Memory.access_count.asc())
                    .limit(overflow)
                    .all()
                )
                for mem in to_delete:
                    db.delete(mem)
                consolidated += len(to_delete)

            db.commit()
            logger.info(f"记忆整理完成: user={user_id}, 清理={consolidated}")
            return consolidated
        except Exception as e:
            db.rollback()
            logger.error(f"记忆整理失败: {e}")
            return 0
        finally:
            db.close()

    # ═══════════════════════════════════════════════════════
    # 内部方法
    # ═══════════════════════════════════════════════════════

    def _parse_extraction(self, raw: str) -> list[dict]:
        """解析LLM提取的原始文本"""
        if not raw or raw.strip().upper() == "NONE":
            return []

        memories = []
        for line in raw.strip().split("\n"):
            line = line.strip()
            if not line:
                continue

            # 尝试解析 "类型|内容|重要度" 格式
            parts = line.split("|", 2)
            if len(parts) < 3:
                # 宽松匹配：尝试识别内容
                if len(parts) == 2:
                    cat, content = parts
                    importance = 0.5  # 默认
                else:
                    continue
            else:
                cat, content, imp_str = parts
                try:
                    importance = float(imp_str.strip())
                except ValueError:
                    importance = 0.5

            cat = cat.strip().lower()
            if cat not in ("preference", "fact", "plan", "background"):
                cat = "fact"

            content = content.strip()
            if len(content) < 3:
                continue

            memories.append({
                "content": content,
                "category": cat,
                "importance": round(min(1.0, max(0.1, importance)), 2),
            })

        return memories

    def _store_memory(self, db: Session, user_id: int, session_id: int,
                      mem: dict, vec: list = None) -> dict:
        """存储单条记忆，复用已计算好的向量（vec 为 None 时尝试现算）"""
        embedding_id = None
        if vec is not None:
            embedding_id = json.dumps(vec)
        else:
            try:
                embedding_id = json.dumps(embed([mem["content"]])[0])
            except Exception as e:
                logger.warning(f"嵌入生成失败: {e}")

        record = Memory(
            user_id=user_id,
            session_id=session_id,
            content=mem["content"],
            category=mem["category"],
            importance=mem["importance"],
            embedding_id=embedding_id,
        )
        db.add(record)
        db.flush()  # 获取 ID
        return {
            "id": record.id,
            "content": record.content,
            "category": record.category,
            "importance": record.importance,
        }

    def _is_duplicate(self, db: Session, user_id: int, session_id: int, content: str,
                      vec: list = None) -> bool:
        """
        检查是否与已有记忆重复。
        优先用向量余弦相似度（对中文也准确），无向量时降级为内容指纹+字符相似度。
        """
        key = self._content_key(content)

        # 取该用户全部已有记忆（上限 MAX_MEMORIES_PER_USER，量可控）
        existing = (
            db.query(Memory)
            .filter(Memory.user_id == user_id, Memory.session_id == session_id)
            .order_by(Memory.created_at.asc())
            .limit(MAX_MEMORIES_PER_USER)
            .all()
        )

        existing = self._safe_memories(db, user_id, session_id, existing)
        for mem in existing:
            # 快速指纹匹配
            if self._content_key(mem.content) == key:
                return True

            # 向量相似度（首选，中文准确）
            if vec is not None and mem.embedding_id:
                try:
                    mem_vec = json.loads(mem.embedding_id)
                    if self._cosine_sim(vec, mem_vec) > MEMORY_SIMILARITY_THRESHOLD:
                        return True
                    continue  # 向量可比则不再走字符相似度
                except (json.JSONDecodeError, TypeError):
                    pass

            # 降级：字符级相似度
            if self._text_similarity(mem.content, content) > MEMORY_SIMILARITY_THRESHOLD:
                return True

        return False

    @staticmethod
    def _content_key(content: str) -> str:
        """生成内容指纹：去掉标点和空格后的核心文本"""
        return re.sub(r'[^\w一-鿿]', '', content.lower())[:50]

    @staticmethod
    def _text_similarity(a: str, b: str) -> float:
        """简单的文本相似度（Jaccard 字符级）"""
        set_a = set(a)
        set_b = set(b)
        if not set_a or not set_b:
            return 0.0
        return len(set_a & set_b) / len(set_a | set_b)

    @staticmethod
    def _cosine_sim(a: list[float], b: list[float]) -> float:
        """余弦相似度"""
        if len(a) != len(b):
            return 0.0
        dot = sum(x * y for x, y in zip(a, b))
        norm_a = math.sqrt(sum(x * x for x in a))
        norm_b = math.sqrt(sum(x * x for x in b))
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return dot / (norm_a * norm_b)

    @staticmethod
    def _keyword_score(content: str, query: str) -> float:
        """关键词匹配得分"""
        query_chars = set(query)
        content_chars = set(content)
        if not query_chars:
            return 0.0
        overlap = query_chars & content_chars
        return len(overlap) / len(query_chars)

    def _keyword_search(self, memories: list, query: str, top_k: int) -> list[dict]:
        """降级方案：纯关键词搜索"""
        scored = []
        for mem in memories:
            score = self._keyword_score(mem.content, query) * 0.6 + (mem.importance or 0.5) * 0.4
            scored.append((score, mem))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [
            {
                "id": mem.id,
                "content": mem.content,
                "category": mem.category,
                "importance": mem.importance,
            }
            for score, mem in scored[:top_k] if score > 0.15
        ]


# ═══════════════════════════════════════════════════════════════
# 工厂函数
# ═══════════════════════════════════════════════════════════════

_memory_engine: Optional[MemoryEngine] = None


def get_memory_engine(db_factory=None) -> Optional[MemoryEngine]:
    """获取全局记忆引擎实例"""
    global _memory_engine
    if _memory_engine is None and db_factory is not None:
        _memory_engine = MemoryEngine(db_factory)
    return _memory_engine


def init_memory_engine(db_factory):
    """初始化记忆引擎"""
    global _memory_engine
    _memory_engine = MemoryEngine(db_factory)
    return _memory_engine
