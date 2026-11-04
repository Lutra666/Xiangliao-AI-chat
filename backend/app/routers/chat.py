"""聊天路由 — 核心对话接口

端点：
  POST /stream          SSE 流式聊天
  POST /send            非流式聊天（兼容）
  GET  /history         会话历史
  GET  /sessions        会话列表
  DELETE /session/{id}  删除会话
  POST /inherit/{id}    继承历史对话
  POST /suggestions     AI 主动建议
  GET  /providers       LLM Provider 列表
  POST /providers/switch 切换 Provider
  GET  /providers/metrics 调用指标

业务逻辑在 services/chat_service.py，SSE 格式在 services/sse.py。
"""
import asyncio
import logging
import time
from datetime import datetime
from typing import Optional, AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, ChatSession, ChatMessage
from ..auth import get_current_user
from ..services.token_manager import estimate_tokens
from ..services.llm_provider import LLMProviderFactory, provider_metrics
from ..core.exceptions import ExternalServiceException
from ..services import chat_service as svc
from ..services.sse import sse_chunk, sse_timing, sse_usage, sse_done, sse_error, sse_event

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Pydantic 模型 ──


class AskRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=20000)
    session_id: Optional[int] = None
    character_id: Optional[int] = None
    parameters: Optional[dict] = None
    response_prompt: Optional[str] = None
    quote_id: Optional[int] = Field(None, gt=0)


class AskResponse(BaseModel):
    answer: str
    sources: list[dict]
    session_id: int
    message_id: int
    timing: dict
    token_usage: dict


class SwitchProviderRequest(BaseModel):
    provider: str = Field(..., description="Provider 名称: deepseek / volcengine")


# ═══════════════════════════════════════════════════════════════
# SSE 流式聊天
# ═══════════════════════════════════════════════════════════════


@router.post("/stream")
async def chat_stream(
    req: AskRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """SSE 流式聊天

    事件格式：
      data: {"type":"chunk","content":"..."}
      data: {"type":"timing","ttft_ms":...,"total_ms":...}
      data: {"type":"usage","context_tokens":...,"answer_tokens":...,"session_total":...}
      data: {"type":"done","session_id":...,"message_id":...,"sources":[...]}
      data: {"type":"error","message":"..."}
    """
    async def event_stream() -> AsyncGenerator[str, None]:
        t_start = time.perf_counter()
        t_first_token = None
        session = None
        user_msg = None
        assistant_msg = None
        full_answer = []
        committed = False

        try:
            # ══ 1. 解析角色 + 合并参数 ══
            char_prompt, char_params = await svc.resolve_character(db, user.id, req.character_id)
            final_params = svc.merge_params(char_params, req.parameters, db, user.id)

            # ══ 2. 获取/创建会话 ══
            session = svc.get_or_create_session(
                db, user.id, req.session_id, req.character_id, final_params
            )

            # ══ 3. 构建 token 优化后的上下文 ══
            question_for_context = req.question
            if req.quote_id:
                quoted = db.query(ChatMessage).filter_by(id=req.quote_id, session_id=session.id).first()
                if not quoted or (quoted.metadata_ or {}).get('recalled'):
                    raise HTTPException(400, '引用消息不存在')
                question_for_context = f"引用的消息：\n{quoted.content}\n\n用户回复：\n{req.question}"
            ctx, llm_provider = await svc.build_chat_context(
                db, user, question_for_context, req.character_id,
                req.response_prompt, final_params, session,
            )
            messages = ctx["messages"]

            # ══ 4. 保存用户消息 ══
            user_msg = ChatMessage(
                session_id=session.id,
                role="user",
                content=req.question,
                metadata_={'quote_id': req.quote_id} if req.quote_id else None,
                token_count=estimate_tokens(req.question),
            )
            db.add(user_msg)
            svc.update_session_title(session, req.question)
            db.commit()
            yield sse_event('started', {'session_id': session.id, 'user_message_id': user_msg.id})

            # ══ 5. LLM 流式调用 ══
            t_llm_start = time.perf_counter()
            final_usage = None

            stream = llm_provider.chat_completion_stream(
                messages=messages,
                temperature=final_params.get("temperature", 0.7),
                max_tokens=final_params.get("max_tokens", 2048),
                top_p=final_params.get("top_p", 0.9),
                **{k: v for k, v in final_params.items()
                   if k in ("frequency_penalty", "presence_penalty")},
            )

            async for chunk in stream:
                if chunk.content:
                    full_answer.append(chunk.content)
                    if t_first_token is None:
                        t_first_token = time.perf_counter()
                    yield sse_chunk(chunk.content)
                if chunk.usage:
                    final_usage = chunk.usage

            # 记录调用指标
            llm_duration = time.perf_counter() - t_llm_start
            total_tokens = final_usage.get("total_tokens", 0) if final_usage else 0
            await provider_metrics.record_call(llm_provider.model_name, llm_duration, total_tokens)

            # ── 时间统计 ──
            t_end = time.perf_counter()
            ttft_ms = int((t_first_token - t_start) * 1000) if t_first_token else 0
            total_ms = int((t_end - t_start) * 1000)
            full_text = "".join(full_answer)

            # ══ 6. 保存 AI 回复 ══
            assistant_msg = ChatMessage(
                session_id=session.id,
                role="assistant",
                content=full_text,
                sources=ctx.get("sources", []) or None,
                token_count=estimate_tokens(full_text),
            )
            db.add(assistant_msg)

            svc.update_session_title(session, req.question)
            svc.add_session_tokens(session, ctx["token_count"], estimate_tokens(full_text))

            # ══ 7. 自动记忆提取 ══
            svc.maybe_trigger_auto_extract(db, session, user.id)

            db.commit()
            committed = True

            yield sse_timing(ttft_ms, total_ms, cached=False)
            yield sse_usage(
                ctx["token_count"],
                estimate_tokens(full_text),
                session.total_tokens_used,
            )
            yield sse_done(session.id, assistant_msg.id, ctx.get("sources", []), user_msg.id)

        except asyncio.CancelledError:
            # 客户端中途断开：兜底落库已生成的部分回复
            if not committed and session is not None and full_answer:
                try:
                    db.rollback()
                    partial = "".join(full_answer)
                    db.add(ChatMessage(
                        session_id=session.id, role="assistant",
                        content=partial, token_count=estimate_tokens(partial),
                    ))
                    svc.update_session_title(session, req.question)
                    db.commit()
                    logger.info("客户端断开，已保存部分回复 (session=%s, len=%d)", session.id, len(partial))
                except Exception:
                    db.rollback()
                    logger.exception("断开连接时保存部分回复失败")
            raise

        except Exception:
            db.rollback()
            logger.exception("流式聊天失败")
            yield sse_error("AI 服务暂不可用，请稍后重试")

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ═══════════════════════════════════════════════════════════════
# 非流式聊天（兼容）
# ═══════════════════════════════════════════════════════════════


@router.post("/send", response_model=AskResponse)
async def send_message(
    req: AskRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """非流式聊天 — 完整返回，包含 timing 和 token_usage"""
    t_start = time.perf_counter()

    char_prompt, char_params = await svc.resolve_character(db, user.id, req.character_id)
    final_params = svc.merge_params(char_params, req.parameters, db, user.id)
    session = svc.get_or_create_session(db, user.id, req.session_id, req.character_id, final_params)

    ctx, llm_provider = await svc.build_chat_context(
        db, user, req.question, req.character_id,
        req.response_prompt, final_params, session,
    )
    messages = ctx["messages"]

    user_msg = ChatMessage(
        session_id=session.id, role="user", content=req.question,
        token_count=estimate_tokens(req.question),
    )
    db.add(user_msg)

    try:
        t_llm_start = time.perf_counter()
        response = await llm_provider.chat_completion(
            messages=messages,
            temperature=final_params.get("temperature", 0.7),
            max_tokens=final_params.get("max_tokens", 2048),
            top_p=final_params.get("top_p", 0.9),
        )
        answer = response.content
        llm_duration = time.perf_counter() - t_llm_start

        await provider_metrics.record_call(
            llm_provider.model_name,
            llm_duration,
            response.usage.get("total_tokens", 0),
        )
    except Exception as e:
        db.rollback()
        await provider_metrics.record_error(llm_provider.model_name)
        logger.exception(f"LLM 调用失败 (provider: {llm_provider.model_name})")
        raise ExternalServiceException(
            message=f"AI 服务暂不可用：{str(e)}",
            details={"provider": llm_provider.model_name},
        )

    t_end = time.perf_counter()
    total_ms = int((t_end - t_start) * 1000)

    assistant_msg = ChatMessage(
        session_id=session.id, role="assistant", content=answer,
        sources=ctx.get("sources", []) or None,
        token_count=estimate_tokens(answer),
    )
    db.add(assistant_msg)

    svc.update_session_title(session, req.question)
    svc.add_session_tokens(session, ctx["token_count"], estimate_tokens(answer))

    svc.maybe_trigger_auto_extract(db, session, user.id)
    db.commit()

    return AskResponse(
        answer=answer, sources=ctx.get("sources", []), session_id=session.id,
        message_id=assistant_msg.id,
        timing={"ttft_ms": 0, "total_ms": total_ms, "cached": False},
        token_usage={
            "context_tokens": ctx["token_count"],
            "answer_tokens": estimate_tokens(answer),
            "session_total": session.total_tokens_used,
        },
    )


# ═══════════════════════════════════════════════════════════════
# 会话管理
# ═══════════════════════════════════════════════════════════════


@router.get("/history")
def get_history(session_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    session = db.query(ChatSession).filter(
        ChatSession.id == session_id, ChatSession.user_id == user.id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc())
        .all()
    )
    return {
        "session_id": session_id,
        "title": session.title,
        "summary": session.summary,
        "memory_paused_after_recall": bool((session.parameters or {}).get("_recall_context_guard")),
        "total_tokens_used": session.total_tokens_used or 0,
        "character_id": session.character_id,
        "messages": [{
            "id": m.id, "role": m.role, "content": m.content,
            "recalled": bool((m.metadata_ or {}).get("recalled")),
            "metadata": m.metadata_ or {},
            "sources": m.sources or [],
            "token_count": m.token_count,
            "created_at": m.created_at.isoformat(),
        } for m in messages],
    }


@router.post("/message/{message_id}/recall")
def recall_message(message_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    message = (db.query(ChatMessage).join(ChatSession)
               .filter(ChatMessage.id == message_id, ChatSession.user_id == user.id)
               .with_for_update().first())
    if not message:
        raise HTTPException(status_code=404, detail="消息不存在")
    session = db.query(ChatSession).filter_by(id=message.session_id, user_id=user.id).with_for_update().one()
    if not (message.metadata_ or {}).get("recalled"):
        message.content = ""
        message.sources = None
        message.metadata_ = {'recalled': True}
        # 老记忆没有消息级来源，无法辨别哪些包含撤回内容。保留数据但暂停注入。
        session.parameters = {**(session.parameters or {}), "_recall_context_guard": True, '_story_summary_verified': False}
        session.summary = None
        session.summary_rounds = 0
        db.commit()
    return {"ok": True, "session_id": session.id}


@router.get("/sessions")
def list_sessions(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    sessions = (
        db.query(ChatSession).filter(ChatSession.user_id == user.id)
        .order_by(ChatSession.updated_at.desc()).all()
    )
    return [{
        "id": s.id, "title": s.title, "character_id": s.character_id,
        "total_tokens_used": s.total_tokens_used or 0,
        "created_at": s.created_at.isoformat(), "updated_at": s.updated_at.isoformat(),
    } for s in sessions]


@router.delete("/session/{session_id}")
def delete_session(session_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    session = db.query(ChatSession).filter(
        ChatSession.id == session_id, ChatSession.user_id == user.id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    db.delete(session)
    db.commit()
    return {"ok": True}


@router.post("/inherit/{session_id}")
def inherit_session(session_id: int, through_message_id: Optional[int] = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """继承历史对话 — 复制消息到新会话"""
    old = db.query(ChatSession).filter(
        ChatSession.id == session_id, ChatSession.user_id == user.id
    ).first()
    if not old:
        raise HTTPException(status_code=404, detail="会话不存在")

    messages = db.query(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(
        ChatMessage.created_at.asc(), ChatMessage.id.asc()
    ).all()
    if through_message_id is not None:
        index = next((i for i, msg in enumerate(messages) if msg.id == through_message_id), None)
        if index is None:
            raise HTTPException(status_code=404, detail="消息不存在")
        messages = messages[:index + 1]

    new_session = ChatSession(
        user_id=user.id,
        character_id=old.character_id,
        title=f"{(old.title or '新对话')[:96]}{'（分支）' if through_message_id is not None else '（续）'}",
        parameters=old.parameters,
    )
    db.add(new_session)
    db.flush()

    msg_count = 0
    for msg in messages:
        db.add(ChatMessage(
            session_id=new_session.id,
            role=msg.role,
            content=msg.content,
            sources=msg.sources,
            token_count=msg.token_count,
            metadata_=msg.metadata_,
        ))
        msg_count += 1

    db.commit()
    return {
        "new_session_id": new_session.id,
        "title": new_session.title,
        "message_count": msg_count,
    }


# ═══════════════════════════════════════════════════════════════
# AI 主动互动建议
# ═══════════════════════════════════════════════════════════════


@router.post("/suggestions")
async def ai_suggestions(session_id: Optional[int] = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """AI 主动生成互动建议"""
    from ..services.memory_engine import get_memory_engine

    if session_id and not db.query(ChatSession.id).filter_by(id=session_id, user_id=user.id).first():
        raise HTTPException(status_code=404, detail="会话不存在")
    recent_messages = (
        db.query(ChatMessage)
        .join(ChatSession)
        .filter(ChatSession.user_id == user.id, ChatSession.id == session_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(10)
        .all()
    )

    memory_count = 0
    engine = get_memory_engine()
    session = db.query(ChatSession).filter_by(id=session_id, user_id=user.id).first() if session_id else None
    if engine and session and not (session.parameters or {}).get("_recall_context_guard"):
        memories = await engine.list_memories(user.id, session_id)
        memory_count = len(memories)

    recent_context = ""
    if recent_messages:
        recent_context = "\n".join([
            f"{'用户' if m.role == 'user' else 'AI'}: {m.content[:100]}"
            for m in reversed(recent_messages)
        ])

    now = datetime.now()
    time_str = f"{now.hour}:{now.minute:02d}"

    prompt = f"""现在是 {time_str}。用户 {user.display_name} 有 {memory_count} 条长期记忆。

最近的对话摘要：
{recent_context if recent_context else '（新用户，还没有对话）'}

请生成 3-5 个 AI 可以主动向用户发起的互动建议。要求：
1. 根据时间、上下文、记忆自然地搭话
2. 每条建议格式：emoji|问题文本
3. 要有实际价值，不要空洞的寒暄
4. 如果上下文足够，可以延续之前的话题
5. 不要重复相似的建议

直接输出，一行一条："""

    try:
        llm_provider = await svc.get_provider_for_user(db, user.id)
        resp = await llm_provider.chat_completion(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.8,
            max_tokens=200,
        )
        raw = resp.content

        suggestions = []
        for line in raw.strip().split("\n"):
            line = line.strip()
            if not line:
                continue
            parts = line.split("|", 1)
            if len(parts) == 2:
                suggestions.append({"icon": parts[0].strip(), "text": parts[1].strip()})
            else:
                suggestions.append({"icon": "💬", "text": line})

        return {"suggestions": suggestions[:5]}
    except Exception as e:
        logger.warning(f"生成建议失败: {e}")
        return {"suggestions": []}


# ═══════════════════════════════════════════════════════════════
# LLM Provider 管理
# ═══════════════════════════════════════════════════════════════


@router.get("/providers", summary="列出可用的 LLM Provider")
async def list_providers(user: User = Depends(get_current_user)):
    providers = LLMProviderFactory.list_available_providers()
    current = await LLMProviderFactory.get_current_provider()
    return {
        "current_provider": current.model_name,
        "available_providers": providers,
    }


@router.post("/providers/switch", summary="切换当前使用的 LLM Provider")
async def switch_provider(req: SwitchProviderRequest, user: User = Depends(get_current_user)):
    try:
        provider = await LLMProviderFactory.switch_provider(req.provider)
        return {
            "ok": True,
            "message": f"已切换至 {req.provider}",
            "model": provider.model_name,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/providers/metrics", summary="获取 LLM 调用指标统计")
async def get_provider_metrics(user: User = Depends(get_current_user)):
    stats = await provider_metrics.get_stats()
    return {
        "metrics": stats,
        "updated_at": datetime.now().isoformat(),
    }
