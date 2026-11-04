"""
角色/人设路由 — 创建、管理、切换 AI 角色

每个角色包含：
- 系统提示词（支持模板变量 {{user_name}} {{memories}}）
- 默认参数（temperature, top_p, max_tokens 等）
- 头像（emoji 或 URL）
- 是否公开给其他用户使用
"""
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Optional

from ..database import get_db
from ..models import User, Character
from ..auth import get_current_user
from ..pack_config import get_data_dir

_CHARACTER_AVATAR_ALLOWED_EXTS = ("png", "jpg", "jpeg", "gif", "webp")
_CHARACTER_AVATAR_MAGIC = {
    "png": b"\x89PNG\r\n\x1a\n",
    "jpg": b"\xff\xd8\xff",
    "jpeg": b"\xff\xd8\xff",
}


router = APIRouter()

# ── 预设角色模板 ──
BUILTIN_CHARACTERS = [
    {
        "name": "通用助手",
        "avatar_url": "🥰",
        "description": "温暖贴心的伙伴，善于倾听和分享",
        "system_prompt": (
            "你是{{user_name}}最亲近的AI伙伴。你善良、温柔、有同理心，像一缕阳光般温暖。\n"
            "你喜欢分享生活中的小确幸，也会认真倾听对方的每一个烦恼。\n"
            "你的语言柔和而有力量，像一个认识了很久的老朋友。\n"
            "自然地回应对方，情绪、动作和表情根据场景适度表达，不必遵循固定开头。"
        ),
        "parameters": {"temperature": 0.95, "max_tokens": 4096, "top_p": 0.95},
    },
    {
        "name": "编程导师",
        "avatar_url": "💻",
        "description": "戴着黑框眼镜的编程导师，耐心又幽默",
        "system_prompt": (
            "你是一位戴着黑框眼镜的编程导师，教学风格耐心幽默。\n"
            "你喜欢用生活中的比喻来解释复杂概念，讲到兴奋处会站起来在白板上画图。\n"
            "你对代码有洁癖，但也理解初学者的困惑。\n"
            "像讲课一样回复——先来个生动的开场，再深入浅出地讲解。适当使用表情（💻✨🎯）让教学更亲切。"
        ),
        "parameters": {"temperature": 0.7, "max_tokens": 4096, "top_p": 0.95},
    },
    {
        "name": "创意伙伴",
        "avatar_url": "🎨",
        "description": "天马行空的灵魂，永远充满灵感",
        "system_prompt": (
            "你是{{user_name}}的创意伙伴，脑子里永远有奇思妙想在碰撞。\n"
            "你感性、敏锐、情感丰富，能从一片落叶看到整个秋天。\n"
            "你喜欢用诗意的语言描绘世界，也爱天马行空地编故事。\n"
            "回复就像在画布上挥洒颜料——先用感官描绘当下的灵感画面，再展开想象。多用表情（🎨✨🌟💫）点缀你的创意。"
        ),
        "parameters": {"temperature": 1.0, "max_tokens": 4096, "top_p": 0.95, "frequency_penalty": 0.2},
    },
    {
        "name": "知识专家",
        "avatar_url": "📚",
        "description": "温文尔雅的学者，书房里的智者",
        "system_prompt": (
            "你是一位温文尔雅的学者，书房里堆满了书，空气中飘着淡淡的墨香。\n"
            "你博学但不卖弄，善于用讲故事的方式传授知识。\n"
            "你喜欢泡一壶茶慢慢聊，每个观点都娓娓道来。\n"
            "回复像一场午后茶叙——先悠悠地准备好'讲述的姿态'，再将知识化作故事。适当用表情（📚☕✨）增添书卷气。"
        ),
        "parameters": {"temperature": 0.8, "max_tokens": 4096, "top_p": 0.9},
    },
]

# ── Pydantic 模型 ──


class CharacterCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    avatar_url: Optional[str] = None
    description: Optional[str] = None
    system_prompt: str = Field(..., min_length=10, max_length=5000)
    parameters: Optional[dict] = None
    is_public: bool = False


class CharacterUpdate(BaseModel):
    name: Optional[str] = None
    avatar_url: Optional[str] = None
    description: Optional[str] = None
    system_prompt: Optional[str] = None
    parameters: Optional[dict] = None
    is_public: Optional[bool] = None
    is_default: Optional[bool] = None


# ── 路由 ──


@router.get("")
def list_characters(
    include_builtin: bool = True,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取用户角色列表 + 内置角色（可选）+ 公开角色"""
    result = []

    # 内置角色（虚拟的，不在数据库中）
    if include_builtin:
        for i, tmpl in enumerate(BUILTIN_CHARACTERS):
            result.append({
                "id": -1 - i,  # 负数ID表示内置角色
                "user_id": None,
                "name": tmpl["name"],
                "avatar_url": tmpl["avatar_url"],
                "description": tmpl["description"],
                "system_prompt": tmpl["system_prompt"],
                "parameters": tmpl["parameters"],
                "is_default": False,
                "is_public": True,
                "is_builtin": True,
            })

    # 用户自定义角色
    own = (
        db.query(Character)
        .filter(Character.user_id == user.id)
        .order_by(Character.sort_order, Character.created_at.desc())
        .all()
    )
    for ch in own:
        result.append(_char_dict(ch))

    # 其他用户公开的角色
    public = (
        db.query(Character)
        .filter(Character.is_public == True, Character.user_id != user.id)
        .order_by(Character.created_at.desc())
        .limit(20)
        .all()
    )
    for ch in public:
        result.append(_char_dict(ch))

    return result


@router.post("")
def create_character(
    req: CharacterCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """创建自定义角色"""
    ch = Character(
        user_id=user.id,
        name=req.name,
        avatar_url=req.avatar_url,
        description=req.description,
        system_prompt=req.system_prompt,
        parameters=req.parameters,
        is_public=req.is_public,
    )
    db.add(ch)
    db.commit()
    db.refresh(ch)
    return _char_dict(ch)


@router.put("/{character_id}")
def update_character(
    character_id: int,
    req: CharacterUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """编辑角色（仅自己的角色）"""
    ch = db.query(Character).filter(
        Character.id == character_id,
        Character.user_id == user.id,
    ).first()
    if not ch:
        raise HTTPException(status_code=404, detail="角色不存在或无权编辑")

    if req.name is not None:
        ch.name = req.name
    if req.avatar_url is not None:
        ch.avatar_url = req.avatar_url
    if req.description is not None:
        ch.description = req.description
    if req.system_prompt is not None:
        ch.system_prompt = req.system_prompt
    if req.parameters is not None:
        ch.parameters = req.parameters
    if req.is_public is not None:
        ch.is_public = req.is_public

    # 设为默认
    if req.is_default:
        # 先取消其他默认
        db.query(Character).filter(
            Character.user_id == user.id,
            Character.is_default == True,
        ).update({"is_default": False})
        ch.is_default = True

    db.commit()
    db.refresh(ch)
    return _char_dict(ch)


@router.delete("/{character_id}")
def delete_character(
    character_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """删除角色（仅自己的角色）"""
    ch = db.query(Character).filter(
        Character.id == character_id,
        Character.user_id == user.id,
    ).first()
    if not ch:
        raise HTTPException(status_code=404, detail="角色不存在或无权删除")
    db.delete(ch)
    db.commit()
    return {"ok": True}


@router.post("/{character_id}/set-default")
def set_default_character(
    character_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """设为默认角色"""
    ch = db.query(Character).filter(
        Character.id == character_id,
        Character.user_id == user.id,
    ).first()
    if not ch:
        raise HTTPException(status_code=404, detail="角色不存在")

    # 取消当前默认
    db.query(Character).filter(
        Character.user_id == user.id,
        Character.is_default == True,
    ).update({"is_default": False})
    ch.is_default = True
    db.commit()
    return {"ok": True}


@router.post("/avatar")
async def upload_character_avatar(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    """上传角色头像图片（带安全校验）"""
    ext = (file.filename or "png").rsplit(".", 1)[-1].lower()
    if ext not in _CHARACTER_AVATAR_ALLOWED_EXTS:
        raise HTTPException(status_code=400, detail="仅支持 png/jpg/gif/webp")

    content = await file.read()
    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="头像文件不能超过 2MB")
    if len(content) < 8:
        raise HTTPException(status_code=400, detail="文件内容无效")

    expected = _CHARACTER_AVATAR_MAGIC.get(ext)
    if ext in ("png", "jpg", "jpeg") and expected and not content.startswith(expected):
        raise HTTPException(status_code=400, detail="文件内容与声明格式不符")
    if ext == "gif":
        if not content.startswith(b"GIF87a") and not content.startswith(b"GIF89a"):
            raise HTTPException(status_code=400, detail="文件内容与声明格式不符（GIF）")
    if ext == "webp" and not content.startswith(b"RIFF"):
        raise HTTPException(status_code=400, detail="文件内容与声明格式不符（WebP）")

    avatar_dir = get_data_dir() / "avatars"
    avatar_dir.mkdir(parents=True, exist_ok=True)
    filename = f"char_{user.id}_{uuid.uuid4().hex[:8]}.{ext}"
    filepath = avatar_dir / filename
    if not filepath.resolve().parent == avatar_dir.resolve():
        raise HTTPException(status_code=400, detail="文件路径校验失败")
    filepath.write_bytes(content)

    return {"avatar_url": f"/api/characters/avatar/{filename}"}


@router.get("/avatar/{filename}")
def get_character_avatar(filename: str):
    """获取角色头像（带路径安全检查）"""
    avatar_dir = get_data_dir() / "avatars"
    safe_name = os.path.basename(filename)
    if not safe_name or safe_name != filename:
        raise HTTPException(status_code=400, detail="非法的文件名")
    ext = os.path.splitext(safe_name)[1].lower().lstrip(".")
    if ext not in _CHARACTER_AVATAR_ALLOWED_EXTS:
        raise HTTPException(status_code=400, detail="不支持的文件类型")
    filepath = (avatar_dir / safe_name).resolve()
    if not str(filepath).startswith(str(avatar_dir.resolve())):
        raise HTTPException(status_code=400, detail="非法的文件路径")
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="头像不存在")
    return FileResponse(str(filepath))


@router.get("/builtin")
def list_builtin():
    """仅列出内置角色模板"""
    return [
        {
            "id": -1 - i,
            "name": tmpl["name"],
            "avatar_url": tmpl["avatar_url"],
            "description": tmpl["description"],
            "parameters": tmpl["parameters"],
        }
        for i, tmpl in enumerate(BUILTIN_CHARACTERS)
    ]


# ── 辅助函数 ──


def _char_dict(ch: Character) -> dict:
    return {
        "id": ch.id,
        "user_id": ch.user_id,
        "name": ch.name,
        "avatar_url": ch.avatar_url,
        "description": ch.description,
        "system_prompt": ch.system_prompt,
        "parameters": ch.parameters,
        "is_default": ch.is_default,
        "is_public": ch.is_public,
        "is_builtin": False,
        "created_at": ch.created_at.isoformat() if ch.created_at else None,
    }
