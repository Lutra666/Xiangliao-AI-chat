# -*- coding: utf-8 -*-
"""Context manager — 上下文优化（摘要 + 记忆注入）"""
import logging
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# 保存 fire-and-forget 任务引用，避免被 GC 提前回收
_pending_tasks: set = set()

MEMORY_INJECT_COUNT = 6
MAX_HISTORY_MSGS = 100
# ── 对话摘要（滚动摘要，省 token）──
SUMMARY_TRIGGER_MSGS = 30   # 历史消息超过此数时触发摘要
SUMMARY_KEEP_MSGS = 10      # 摘要后保留最近 N 条原文消息
SUMMARY_TOKEN_BUDGET = 600  # 摘要本身的大致 token 预算（max_tokens）

DEFAULT_FORMAT_PROMPT = (
    "【自然交流】保持角色独特的性格、语气和经历，像正在认真与对方交流一样回应。"
    "留意对方的情绪和具体话语，结合当前场景表达关心、喜悦、犹豫或幽默，不必每次都追问。"
    "回应应有细节和变化，避免客服腔、模板句、重复夸奖和过度热情。"
    "尊重角色与剧情的一致性，不替用户决定感受、行动或台词，不编造未发生的共同经历。"
    "\n\n【表达方式】日常聊天自然简洁；剧情需要时适量加入动作、神态和环境，"
    "让情绪体现在具体反应里，不要强制每句都加动作或固定格式。回复长短随对话节奏变化。"
)


def estimate_tokens(text):
    """
    估算文本的 token 数。
    按中英文分别加权：中文字符约 1 token/字，英文/数字约 4 字符/token。
    比原来「一律 len//2」更接近真实分词，对英文 system prompt 尤其重要。
    """
    if not text:
        return 0
    cjk = 0
    other = 0
    for ch in text:
        # CJK 统一汉字 + 常见中日韩扩展
        if '一' <= ch <= '鿿' or '㐀' <= ch <= '䶿':
            cjk += 1
        else:
            other += 1
    # 中文 ~1 token/字；英文 ~4 字符/token
    total = cjk + other / 4
    return max(1, int(total))


def estimate_messages_tokens(messages):
    return sum(estimate_tokens(str(m.get("content", ""))) + 4 for m in messages)


def build_system_prompt(character_prompt=None, response_prompt=""):
    # response_prompt 放最后：LLM 对靠后的指令权重更高，确保用户指令优先于角色人设
    fmt = DEFAULT_FORMAT_PROMPT + ("\n\n【用户偏好】" + response_prompt if response_prompt else "")
    if character_prompt:
        return character_prompt + "\n\n---\n\n" + fmt
    return fmt + "\n\nyou are XiangLiao, a warm AI companion."


SUMMARY_PROMPT = """请把以下对话历史压缩成一段简洁的中文摘要，用于让 AI 在后续对话中回忆前情。

要求：
1. 只保留关键事实、用户意图、已达成的共识、未解决的问题
2. 省略寒暄、重复、无关细节
3. 用第三人称客观陈述，不要编造未出现的信息
4. 控制在 300 字以内，纯文本，不要列表/标题

对话历史：
{conversation}

摘要："""


async def generate_session_summary(older_messages, llm_provider):
    """
    用 LLM 把较早的对话消息压缩成摘要。
    older_messages: [{"role","content"}, ...]（已被截断掉的较早部分）
    llm_provider: LLM Provider 实例
    返回摘要文本，失败返回空字符串。
    """
    if not older_messages:
        return ""
    conversation = "\n".join(
        f"{'用户' if m['role'] == 'user' else 'AI'}: {m['content']}"
        for m in older_messages
    )
    try:
        resp = await llm_provider.chat_completion(
            messages=[{"role": "user", "content": SUMMARY_PROMPT.format(conversation=conversation)}],
            temperature=0.3,
            max_tokens=SUMMARY_TOKEN_BUDGET,
        )
        return (resp.content or "").strip()
    except Exception as e:
        logger.warning(f"生成会话摘要失败: {e}")
        return ""


async def build_optimized_context(db, user_id, session_id, current_question,
    character_prompt=None, user_name="", max_rounds=9999,
    memory_engine=None, response_prompt="",
    character_id=None, parameters=None, session=None, llm_provider=None):
    from ..models import ChatMessage

    result = {"messages": [], "token_count": 0, "injected_memories": 0,
              "had_summary": False, "cache_hit": False, "cached_answer": None,
              "sources": []}

    # 缓存功能已移除：确保 response_prompt 等指令始终实时生效
    all_msgs = db.query(ChatMessage).filter(
        ChatMessage.session_id == session_id
    ).order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc()).all()
    all_msgs = [m for m in all_msgs if not (m.metadata_ or {}).get("recalled")]
    recall_guard = bool(session and (session.parameters or {}).get("_recall_context_guard"))

    # ── 滚动摘要：历史过长时，用摘要替代较早的消息，省 token ──
    # 策略：本次先注入已有摘要（若有）+ 保留最近 SUMMARY_KEEP_MSGS 条原文；
    #       若历史超阈值且无摘要，异步生成（下次生效，不阻塞本次响应）。
    summary_text = getattr(session, "summary", None) if session and not recall_guard else None
    if len(all_msgs) > SUMMARY_TRIGGER_MSGS:
        recent = all_msgs[-SUMMARY_KEEP_MSGS:]
        if summary_text:
            result["had_summary"] = True
        elif llm_provider is not None and session is not None and not recall_guard:
            # 异步生成摘要：用独立的 DB Session，避免请求结束后 session 被关闭
            _session_id = session.id
            older = [{"role": m.role, "content": m.content}
                     for m in all_msgs[:-SUMMARY_KEEP_MSGS]]
            import asyncio as _asyncio
            from ..database import SessionLocal as _SL
            from ..models import ChatSession as _CS

            async def _gen_and_store():
                _db = _SL()
                try:
                    summ = await generate_session_summary(older, llm_provider)
                    if summ:
                        _sess = _db.query(_CS).filter(_CS.id == _session_id).first()
                        if _sess:
                            _sess.summary = summ
                            _db.commit()
                except Exception as e:
                    logger.warning(f"异步生成摘要失败: {e}")
                    try:
                        _db.rollback()
                    except Exception:
                        pass
                finally:
                    _db.close()
            _task = _asyncio.create_task(_gen_and_store())
            _pending_tasks.add(_task)
            _task.add_done_callback(_pending_tasks.discard)
    else:
        recent = all_msgs[-MAX_HISTORY_MSGS:] if len(all_msgs) > MAX_HISTORY_MSGS else all_msgs

    # 应用 max_rounds 截断：限制注入的历史对话轮数（消息数）
    if max_rounds and max_rounds < len(recent):
        recent = recent[-max_rounds:]

    # build system prompt (substitute {{user_name}} template if present)
    system_content = build_system_prompt(character_prompt=character_prompt, response_prompt=response_prompt)
    if user_name:
        system_content = system_content.replace("{{user_name}}", user_name)

    params = session.parameters or {} if session else {}
    if params.get('_story_summary') and (not recall_guard or params.get('_story_summary_verified')):
        system_content += '\n\n【剧情小结】\n' + params['_story_summary']

    # inject 已有摘要（替代较早的对话历史）
    if summary_text and result["had_summary"]:
        system_content += f"\n\n---\n\n【之前对话摘要】（用于了解上下文）\n{summary_text}"

    # inject memories (if memory engine available)
    injected_memories = []
    if memory_engine:
        try:
            memories = await memory_engine.retrieve_relevant(
                user_id=user_id,
                session_id=session_id,
                query=current_question,
                top_k=MEMORY_INJECT_COUNT
            )
            if memories:
                # 按类别分组注入，更清晰
                cat_groups: dict[str, list] = {}
                for m in memories:
                    cat = m.get("category", "other")
                    cat_groups.setdefault(cat, []).append(m["content"])
                cat_labels = {
                    "preference": "偏好",
                    "background": "背景",
                    "fact": "事实",
                    "plan": "计划",
                }
                lines = []
                for cat, items in cat_groups.items():
                    label = cat_labels.get(cat, cat)
                    for item in items:
                        lines.append(f"  [{label}] {item}")
                memory_text = "\n".join(lines)
                system_content += f"\n\n---\n\n【已知用户信息】（根据当前对话相关性筛选，自然融入回复中）\n{memory_text}"
                result["injected_memories"] = len(memories)
        except Exception as e:
            logger.warning(f"Memory injection failed: {e}")

    messages = [{"role": "system", "content": system_content}]

    by_id = {m.id: m for m in all_msgs}
    for m in recent:
        content = m.content
        quoted = by_id.get((m.metadata_ or {}).get('quote_id'))
        if quoted:
            content = f"引用的消息：\n{quoted.content}\n\n用户回复：\n{content}"
        messages.append({"role": m.role, "content": content})

    messages.append({"role": "user", "content": current_question})

    total = estimate_messages_tokens(messages)
    result["messages"] = messages
    result["token_count"] = total
    return result
