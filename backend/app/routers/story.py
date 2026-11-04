"""剧情聊天：回复版本、收藏、搜索和剧情小结。"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from ..auth import get_current_user
from ..database import get_db
from ..models import User, ChatSession, ChatMessage
from ..services import chat_service as svc
from ..services.token_manager import build_system_prompt

router = APIRouter()


def owned_message(db, user, message_id):
    message = (db.query(ChatMessage).join(ChatSession)
               .filter(ChatMessage.id == message_id, ChatSession.user_id == user.id).first())
    if not message or (message.metadata_ or {}).get('recalled'):
        raise HTTPException(404, '消息不存在')
    return message


def owned_session(db, user, session_id):
    session = db.query(ChatSession).filter_by(id=session_id, user_id=user.id).first()
    if not session:
        raise HTTPException(404, '会话不存在')
    return session


class BookmarkUpdate(BaseModel):
    saved: bool
    note: str = Field('', max_length=500)
    node: bool = False


class SummaryUpdate(BaseModel):
    summary: str = Field('', max_length=10000)


class SelectVersion(BaseModel):
    index: int = Field(..., ge=0)


@router.put('/message/{message_id}/bookmark')
def bookmark(message_id: int, data: BookmarkUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    msg = owned_message(db, user, message_id)
    msg.metadata_ = {**(msg.metadata_ or {}), 'bookmark': {'note': data.note.strip(), 'node': data.node} if data.saved else None}
    db.commit()
    return {'ok': True}


@router.get('/search')
def search(q: str = '', saved: bool = False, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    term = q.strip().lower()
    if not term and not saved:
        return []
    rows = (db.query(ChatMessage, ChatSession.title).join(ChatSession)
            .filter(ChatSession.user_id == user.id).order_by(ChatMessage.id.desc()).all())
    result = []
    for msg, title in rows:
        meta = msg.metadata_ or {}
        if meta.get('recalled') or (saved and not meta.get('bookmark')):
            continue
        note = (meta.get('bookmark') or {}).get('note', '')
        if term and term not in (msg.content or '').lower() and term not in note.lower():
            continue
        result.append({'id': msg.id, 'session_id': msg.session_id, 'title': title, 'role': msg.role,
                       'content': msg.content, 'note': note, 'node': bool((meta.get('bookmark') or {}).get('node'))})
        if len(result) >= 100:
            break
    return result


@router.put('/session/{session_id}/story')
def set_story(session_id: int, data: SummaryUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    session = owned_session(db, user, session_id)
    session.parameters = {**(session.parameters or {}), '_story_summary': data.summary.strip(), '_story_summary_verified': True}
    db.commit()
    return {'ok': True}


@router.get('/session/{session_id}/story')
def get_story(session_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    session = owned_session(db, user, session_id)
    return {'summary': (session.parameters or {}).get('_story_summary', '')}


@router.post('/message/{message_id}/version')
async def generate_version(message_id: int, mode: str = Query('retry', pattern='^(retry|continue)$'),
                           user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    msg = owned_message(db, user, message_id)
    if msg.role != 'assistant':
        raise HTTPException(400, '只能对 AI 回复进行此操作')
    session = owned_session(db, user, msg.session_id)
    messages = (db.query(ChatMessage).filter_by(session_id=session.id)
                .order_by(ChatMessage.created_at, ChatMessage.id).all())
    index = next(i for i, item in enumerate(messages) if item.id == msg.id)
    prior = [m for m in messages[:index] if not (m.metadata_ or {}).get('recalled')]
    if not prior:
        raise HTTPException(400, '没有可供生成的上下文')
    prompt, char_params = await svc.resolve_character(db, user.id, session.character_id)
    settings = svc.merge_params(char_params, session.parameters, db, user.id)
    llm = await svc.get_provider_for_user(db, user.id)
    system = build_system_prompt(prompt, svc.get_response_prompt(db, user.id)).replace('{{user_name}}', user.display_name or '')
    story = (session.parameters or {}).get('_story_summary', '')
    if story and (not (session.parameters or {}).get('_recall_context_guard') or (session.parameters or {}).get('_story_summary_verified')):
        system += '\n\n【剧情小结】\n' + story
    by_id = {m.id: m for m in prior}
    context = [{'role': 'system', 'content': system}]
    for item in prior[-60:]:
        content = item.content
        quoted = by_id.get((item.metadata_ or {}).get('quote_id'))
        if quoted:
            content = f'引用的消息：\n{quoted.content}\n\n用户回复：\n{content}'
        context.append({'role': item.role, 'content': content})
    from ..services.memory_engine import get_memory_engine
    memory_engine = get_memory_engine()
    latest_user = next((m.content for m in reversed(prior) if m.role == 'user'), '')
    if memory_engine and latest_user:
        relevant = await memory_engine.retrieve_relevant(user.id, session.id, latest_user)
        if relevant:
            context[0]['content'] += '\n\n【相关记忆】\n' + '\n'.join('- ' + item['content'] for item in relevant)
    if mode == 'continue':
        context += [{'role': 'assistant', 'content': msg.content}, {'role': 'user', 'content': '请从刚才停下的地方自然继续，不要重复已写内容。'}]
    try:
        response = await llm.chat_completion(context, temperature=settings.get('temperature', .7),
                                             max_tokens=settings.get('max_tokens', 2048), top_p=settings.get('top_p', .9))
    except Exception:
        raise HTTPException(502, '生成失败，请检查模型连接后重试')
    if not response.content.strip():
        raise HTTPException(502, '模型未返回内容，请重试')
    meta = dict(msg.metadata_ or {})
    versions = list(meta.get('versions') or [msg.content])
    versions.append(msg.content + response.content if mode == 'continue' else response.content)
    msg.content = versions[-1]
    msg.metadata_ = {**meta, 'versions': versions, 'version_index': len(versions) - 1}
    session.summary = None
    # 原先提取的记忆可能基于旧回复，保护历史数据且不注入不确定内容。
    session.parameters = {**(session.parameters or {}), '_recall_context_guard': True, '_story_summary_verified': False}
    db.commit()
    return {'content': msg.content, 'versions': versions, 'version_index': len(versions) - 1}


@router.put('/message/{message_id}/version')
def select_version(message_id: int, data: SelectVersion, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    msg = owned_message(db, user, message_id)
    meta = dict(msg.metadata_ or {})
    versions = meta.get('versions') or [msg.content]
    if msg.role != 'assistant' or data.index >= len(versions):
        raise HTTPException(400, '回复版本不存在')
    msg.content = versions[data.index]
    msg.metadata_ = {**meta, 'version_index': data.index}
    session = owned_session(db, user, msg.session_id)
    session.summary = None
    session.parameters = {**(session.parameters or {}), '_recall_context_guard': True, '_story_summary_verified': False}
    db.commit()
    return {'content': msg.content, 'versions': versions, 'version_index': data.index}
