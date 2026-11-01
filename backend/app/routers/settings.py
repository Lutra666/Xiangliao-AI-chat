"""
用户设置路由 — 偏好、模型选择、功能开关
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import Optional, List, Dict

from ..database import get_db
from ..models import User, UserSettings
from ..auth import get_current_user
from ..config import LLM_PROVIDER
from ..services.llm_provider import (
    get_models_for_provider,
    get_allowed_models_for_provider,
    get_all_models_info,
)

router = APIRouter()

# ── Pydantic 模型 ──

class SettingsUpdate(BaseModel):
    theme: Optional[str] = None                       # light / dark / auto
    language: Optional[str] = None                    # zh / en
    default_model: Optional[str] = None               # 模型 ID
    default_parameters: Optional[dict] = None          # temperature, top_p, max_tokens 等
    memory_enabled: Optional[bool] = None
    memory_auto_extract: Optional[bool] = None
    summary_enabled: Optional[bool] = None
    response_prompt: Optional[str] = None               # 全局"回答提示词"
    max_history_rounds: Optional[int] = Field(None, ge=2, le=9999)


# ── 路由 ──

@router.get("")
def get_settings(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取用户设置，不存在则自动创建默认设置（并发安全）"""
    settings = db.query(UserSettings).filter(UserSettings.user_id == user.id).first()
    if not settings:
        try:
            settings = UserSettings(user_id=user.id)
            db.add(settings)
            db.commit()
            db.refresh(settings)
        except IntegrityError:
            db.rollback()
            settings = db.query(UserSettings).filter(UserSettings.user_id == user.id).first()
    return _settings_dict(settings)


@router.put("")
def update_settings(
    req: SettingsUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """更新用户设置"""
    settings = db.query(UserSettings).filter(UserSettings.user_id == user.id).first()
    if not settings:
        settings = UserSettings(user_id=user.id)
        db.add(settings)

    data = req.model_dump(exclude_none=True)

    # 安全验证：限制 response_prompt 长度，防止提示注入攻击
    if "response_prompt" in data and data["response_prompt"]:
        if len(data["response_prompt"]) > 2000:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="回答提示词不能超过 2000 个字符")

    # 验证 theme 值
    if "theme" in data:
        if data["theme"] not in ["light", "dark", "auto"]:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="无效的主题设置")

    # 验证 language 值
    if "language" in data:
        if data["language"] not in ["zh", "en"]:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="无效的语言设置")

    # 验证 model 参数 - 从所有 Provider 的可用模型中校验
    if "default_model" in data:
        all_models = get_all_models_info()
        allowed_models = [m["id"] for m in all_models]
        if data["default_model"] not in allowed_models:
            raise HTTPException(status_code=400, detail=f"不支持的模型，可选: {', '.join(allowed_models)}")

    for field, value in data.items():
        setattr(settings, field, value)

    db.commit()
    db.refresh(settings)
    return _settings_dict(settings)


@router.get("/models")
def list_models():
    """可用的 AI 模型列表 - 返回所有 Provider 的全部模型"""
    return get_all_models_info()


def _settings_dict(s: UserSettings) -> dict:
    return {
        "theme": s.theme,
        "language": s.language,
        "default_model": s.default_model,
        "default_parameters": s.default_parameters,
        "memory_enabled": s.memory_enabled,
        "memory_auto_extract": s.memory_auto_extract,
        "summary_enabled": s.summary_enabled,
        "response_prompt": s.response_prompt or "",
        "max_history_rounds": s.max_history_rounds,
    }
