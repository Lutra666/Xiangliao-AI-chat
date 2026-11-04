"""
记忆路由 — 查看、管理 AI 长记忆
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db, SessionLocal
from ..models import User, ChatSession, Memory, MemoryProvenance
from ..auth import get_current_user
from ..services.memory_engine import get_memory_engine

router = APIRouter()


MEMORY_CATEGORIES = ("preference", "fact", "plan", "background")


class MemoryUpdate(BaseModel):
    """允许用户修改的记忆字段白名单"""
    content: Optional[str] = Field(None, min_length=1, max_length=5000)
    category: Optional[str] = Field(None, pattern=r"^(preference|fact|plan|background)$")
    importance: Optional[float] = Field(None, ge=0.0, le=1.0)


class MemoryCreate(BaseModel):
    session_id: int = Field(..., gt=0)
    content: str = Field(..., min_length=1, max_length=5000)
    category: str = Field("fact", pattern=r"^(preference|fact|plan|background)$")


@router.post("")
def create_memory(data: MemoryCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not db.query(ChatSession.id).filter_by(id=data.session_id, user_id=user.id).first():
        raise HTTPException(status_code=404, detail="会话不存在")
    content = data.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="记忆内容不能为空")
    memory = Memory(user_id=user.id, session_id=data.session_id, content=content,
                    category=data.category, importance=0.7)
    db.add(memory)
    db.flush()
    db.add(MemoryProvenance(memory_id=memory.id, sources=[]))
    db.commit()
    return {"id": memory.id}


@router.get("/list")
async def list_memories(
    session_id: int = Query(..., gt=0),
    category: Optional[str] = Query(None, pattern=r"^(preference|fact|plan|background)$"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """列出当前会话的AI记忆"""
    if not db.query(ChatSession.id).filter_by(id=session_id, user_id=user.id).first():
        raise HTTPException(status_code=404, detail="会话不存在")
    engine = get_memory_engine()
    if not engine:
        raise HTTPException(status_code=500, detail="记忆引擎未初始化")
    return await engine.list_memories(user.id, session_id, category=category)


@router.delete("/{memory_id}")
async def delete_memory(
    memory_id: int,
    user: User = Depends(get_current_user),
):
    """删除一条记忆"""
    engine = get_memory_engine()
    if not engine:
        raise HTTPException(status_code=500, detail="记忆引擎未初始化")
    ok = await engine.delete_memory(user.id, memory_id)
    if not ok:
        raise HTTPException(status_code=404, detail="记忆不存在")
    return {"ok": True}


@router.put("/{memory_id}")
async def update_memory(
    memory_id: int,
    data: MemoryUpdate,
    user: User = Depends(get_current_user),
):
    """更新记忆内容/类型/重要度（仅允许修改白名单字段）"""
    engine = get_memory_engine()
    if not engine:
        raise HTTPException(status_code=500, detail="记忆引擎未初始化")
    payload = data.model_dump(exclude_none=True)
    if not payload:
        raise HTTPException(status_code=400, detail="未提供要更新的字段")
    ok = await engine.update_memory(user.id, memory_id, payload)
    if not ok:
        raise HTTPException(status_code=404, detail="记忆不存在")
    return {"ok": True}


@router.post("/consolidate")
async def consolidate_memories(
    session_id: int = Query(..., gt=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """手动触发记忆整理（合并相似、清理过期）"""
    engine = get_memory_engine()
    if not engine:
        raise HTTPException(status_code=500, detail="记忆引擎未初始化")
    if not db.query(ChatSession.id).filter_by(id=session_id, user_id=user.id).first():
        raise HTTPException(status_code=404, detail="会话不存在")
    count = await engine.consolidate(user.id, session_id)
    return {"consolidated": count}
