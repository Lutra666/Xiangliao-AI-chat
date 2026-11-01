"""聊天业务服务 — 从 routers/chat.py 下沉的业务逻辑

职责：
  - 角色解析（内置/自定义/默认）
  - 参数合并与校验
  - 会话获取/创建
  - 上下文构建（组合记忆 + 摘要）
  - 自动记忆提取
  - 用户设置查询

不包含：
  - HTTP 端点定义（留在 routers/chat.py）
  - SSE 事件格式化（在 services/sse.py）
"""
import asyncio
import logging
from datetime import datetime
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models import (
    User, ChatSession, ChatMessage, Character, UserSettings,
)
from ..database import SessionLocal
from .token_manager import estimate_tokens, build_optimized_context
from .memory_engine import get_memory_engine, EXTRACT_TRIGGER_ROUNDS
from .llm_provider import (
    get_llm_provider,
    get_provider_for_model,
    get_actual_model_name,
)

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════
# 角色与参数
# ═══════════════════════════════════════════════════════════════


async def resolve_character(db: Session, user_id: int, character_id: Optional[int]) -> tuple:
    """解析角色 → (system_prompt, parameters)

    优先级：指定内置角色（负ID） > 指定自定义角色 > 默认角色 > 内置第一个
    """
    from ..routers.characters import BUILTIN_CHARACTERS

    if character_id is not None and character_id < 0:
        idx = abs(character_id) - 1
        if 0 <= idx < len(BUILTIN_CHARACTERS):
            t = BUILTIN_CHARACTERS[idx]
            return t["system_prompt"], t["parameters"]

    if character_id is not None and character_id > 0:
        ch = db.query(Character).filter(Character.id == character_id).first()
        if ch and (ch.user_id == user_id or ch.is_public):
            return ch.system_prompt, ch.parameters or {}

    default = db.query(Character).filter(
        Character.user_id == user_id, Character.is_default == True
    ).first()
    if default:
        return default.system_prompt, default.parameters or {}

    if BUILTIN_CHARACTERS:
        return BUILTIN_CHARACTERS[0]["system_prompt"], BUILTIN_CHARACTERS[0]["parameters"]
    return None, {}


def merge_params(char_params: dict, req_params: Optional[dict], db: Session, user_id: int) -> dict:
    """合并参数：请求 > 角色 > 用户设置 > 默认，含范围校验"""
    settings = get_user_settings(db, user_id)
    merged = {"temperature": 0.9, "max_tokens": 900, "top_p": 0.95}  # 900 token 硬兜底≈600中文字
    if settings and settings.default_parameters:
        merged.update(settings.default_parameters)
    if char_params:
        merged.update(char_params)
    if req_params:
        merged.update({k: v for k, v in req_params.items() if v is not None})

    # 参数范围校验，防止越界值导致 LLM API 报错
    if "temperature" in merged:
        merged["temperature"] = max(0.0, min(2.0, float(merged["temperature"])))
    if "max_tokens" in merged:
        merged["max_tokens"] = max(1, min(8192, int(merged["max_tokens"])))
    if "top_p" in merged:
        merged["top_p"] = max(0.0, min(1.0, float(merged["top_p"])))
    return merged


# ═══════════════════════════════════════════════════════════════
# 会话管理
# ═══════════════════════════════════════════════════════════════


def get_or_create_session(
    db: Session, user_id: int, session_id: Optional[int],
    character_id: Optional[int], params: dict,
) -> ChatSession:
    """获取已有会话或创建新会话"""
    if session_id:
        session = db.query(ChatSession).filter(
            ChatSession.id == session_id, ChatSession.user_id == user_id
        ).first()
        if not session:
            raise HTTPException(status_code=404, detail="会话不存在")
        return session
    session = ChatSession(
        user_id=user_id,
        character_id=character_id if (character_id and character_id > 0) else None,
        parameters=params,
    )
    db.add(session)
    db.flush()  # 不提前 commit，让外层请求结束时统一落库
    return session


def count_user_rounds(session: ChatSession) -> int:
    """统计会话中用户消息轮数（session.messages 是 lazy=dynamic，返回 Query）"""
    return session.messages.filter(ChatMessage.role == "user").count()


def update_session_title(session: ChatSession, question: str) -> None:
    """如果是新对话，用问题前 30 字作为标题"""
    if session.title == "新对话":
        stripped = question.strip()
        session.title = stripped[:30] + ("..." if len(stripped) > 30 else "")


def add_session_tokens(session: ChatSession, context_tokens: int, answer_tokens: int) -> None:
    """累加会话 token 用量"""
    session.total_tokens_used = (
        (session.total_tokens_used or 0) + context_tokens + answer_tokens
    )


# ═══════════════════════════════════════════════════════════════
# 用户设置查询
# ═══════════════════════════════════════════════════════════════


def get_user_settings(db: Session, user_id: int) -> Optional[UserSettings]:
    return db.query(UserSettings).filter(UserSettings.user_id == user_id).first()


def get_user_max_rounds(db: Session, user_id: int) -> int:
    s = get_user_settings(db, user_id)
    return s.max_history_rounds if s else 10


def get_response_prompt(db: Session, user_id: int) -> str:
    s = get_user_settings(db, user_id)
    return (s.response_prompt or "") if s else ""


async def get_provider_for_user(db: Session, user_id: int):
    """根据用户设置的 default_model 自动选择对应的 LLM Provider

    支持同 provider 多模型：如选了 deepseek-v4-flash-volcengine，
    会用火山引擎 provider 但 model 设为实际模型名 deepseek-v4-flash。
    """
    settings = get_user_settings(db, user_id)
    model = settings.default_model if settings else None
    provider_name = get_provider_for_model(model) if model else None
    # 查实际模型名（火山引擎聚合模型场景，actual_model 才是真正传给 API 的）
    actual_model = get_actual_model_name(model) if model else None
    return await get_llm_provider(provider_name, actual_model)


# ═══════════════════════════════════════════════════════════════
# 上下文构建（stream / send 共用）
# ═══════════════════════════════════════════════════════════════


async def build_chat_context(
    db: Session, user: User, req_question: str,
    character_id: Optional[int], response_prompt: Optional[str],
    final_params: dict, session: ChatSession,
):
    """构建 token 优化的上下文（角色 prompt + 摘要 + 记忆）

    返回 (ctx, llm_provider)，ctx 包含 messages/token_count/sources 等。
    """
    char_prompt, _ = await resolve_character(db, user.id, character_id)

    llm_provider = await get_provider_for_user(db, user.id)

    ctx = await build_optimized_context(
        db=db,
        user_id=user.id,
        session_id=session.id,
        current_question=req_question,
        character_prompt=char_prompt,
        user_name=user.display_name,
        max_rounds=get_user_max_rounds(db, user.id),
        memory_engine=get_memory_engine(),
        response_prompt=response_prompt or get_response_prompt(db, user.id),
        character_id=character_id,
        parameters=final_params,
        session=session,
        llm_provider=llm_provider,
    )
    return ctx, llm_provider


# ═══════════════════════════════════════════════════════════════
# 自动记忆提取
# ═══════════════════════════════════════════════════════════════


class _AutoExtractSession:
    """简易 async context：进入用 SessionLocal，退出 close"""
    def __init__(self, session):
        self.session = session
    async def __aenter__(self):
        return self.session
    async def __aexit__(self, *exc):
        self.session.close()


async def auto_extract_safe(db: Session, user_id: int, session_id: int):
    """fire-and-forget 包装：用独立 session 避免请求结束后 db 被 close"""
    try:
        async with _AutoExtractSession(SessionLocal()) as _db:
            await auto_extract(_db, user_id, session_id)
    except Exception as e:
        logger.warning(f"自动记忆提取失败: {e}")


async def auto_extract(db: Session, user_id: int, session_id: int):
    """自动提取记忆（用传入的独立 session）"""
    engine = get_memory_engine()
    if not engine:
        return
    session = db.query(ChatSession).filter_by(id=session_id, user_id=user_id).first()
    if not session or (session.parameters or {}).get("_recall_context_guard"):
        return
    settings = get_user_settings(db, user_id)
    if settings and not settings.memory_auto_extract:
        return
    messages = (
        db.query(ChatMessage).filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.asc()).all()
    )
    recent = [{"role": m.role, "content": m.content} for m in messages if not (m.metadata_ or {}).get("recalled")][-20:]

    async def _l(prompt, system_prompt=None, **kw):
        llm = await get_provider_for_user(db, user_id)
        msgs = []
        if system_prompt:
            msgs.append({"role": "system", "content": system_prompt})
        msgs.append({"role": "user", "content": prompt})
        r = await llm.chat_completion(messages=msgs, temperature=0.1, max_tokens=500)
        return r.content

    await engine.extract_and_store(user_id, session_id, recent, _l)


def maybe_trigger_auto_extract(db: Session, session: ChatSession, user_id: int) -> bool:
    """检查是否该触发自动记忆提取，返回是否触发"""
    db.flush()
    user_rounds = count_user_rounds(session)
    if user_rounds > 0 and user_rounds % EXTRACT_TRIGGER_ROUNDS == 0:
        asyncio.create_task(auto_extract_safe(db, user_id, session.id))
        return True
    return False
