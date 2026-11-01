"""SSE 事件格式化工具 — 统一聊天流式事件格式

事件类型：
  chunk   — 内容片段
  timing  — 时间统计（ttft_ms / total_ms / cached）
  usage   — token 用量（context_tokens / answer_tokens / session_total）
  done    — 完成（session_id / message_id / sources）
  error   — 错误（message）
"""
import json


def sse_event(event_type: str, data: dict) -> str:
    """通用 SSE 事件"""
    return f"data: {json.dumps({'type': event_type, **data}, ensure_ascii=False)}\n\n"


def sse_chunk(content: str) -> str:
    """内容片段事件"""
    return f"data: {json.dumps({'type': 'chunk', 'content': content}, ensure_ascii=False)}\n\n"


def sse_timing(ttft_ms: int, total_ms: int, cached: bool = False) -> str:
    return sse_event("timing", {"ttft_ms": ttft_ms, "total_ms": total_ms, "cached": cached})


def sse_usage(context_tokens: int, answer_tokens: int, session_total: int) -> str:
    return sse_event("usage", {
        "context_tokens": context_tokens,
        "answer_tokens": answer_tokens,
        "session_total": session_total,
    })


def sse_done(session_id: int, message_id: int, sources: list) -> str:
    return sse_event("done", {
        "session_id": session_id,
        "message_id": message_id,
        "sources": sources or [],
    })


def sse_error(message: str) -> str:
    return sse_event("error", {"message": message})
