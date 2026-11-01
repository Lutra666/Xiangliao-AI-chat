import hashlib
import os
import secrets
import re
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from pydantic import BaseModel, validator
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from ..database import get_db
from ..models import User
from ..auth import (
    create_token,
    get_current_user,
    check_login_attempt,
    record_login_failure,
    reset_login_attempt,
    constant_time_compare,
)

# 密码哈希迭代次数（提高安全性）
PBKDF2_ITERATIONS = 600_000


def _hash_password(password: str) -> str:
    """PBKDF2-SHA256 哈希密码 - 使用更高的迭代次数提升安全性"""
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), PBKDF2_ITERATIONS)
    return f"pbkdf2:sha256:{PBKDF2_ITERATIONS}:{salt}${dk.hex()}"


def _verify_password(password: str, stored: str) -> bool:
    """验证密码 - 恒时比较防止时序攻击"""
    try:
        parts = stored.split(":")
        if len(parts) == 4:
            _, algo, iterations_str, salt_and_hash = parts
            iterations = int(iterations_str)
        else:
            _, algo, salt_and_hash = parts
            iterations = 200_000  # 兼容旧版本

        salt, hash_val = salt_and_hash.split("$")
        dk = hashlib.pbkdf2_hmac(algo, password.encode(), salt.encode(), iterations)
        return constant_time_compare(dk.hex(), hash_val)
    except (ValueError, AttributeError, IndexError):
        # 即使格式错误也进行假计算，防止时序攻击
        hashlib.pbkdf2_hmac("sha256", password.encode(), b"dummy", PBKDF2_ITERATIONS)
        return False


def _is_strong_password(password: str) -> tuple[bool, str]:
    """检查密码强度"""
    if len(password) < 8:
        return False, "密码至少需要8个字符"
    if not re.search(r"[a-zA-Z]", password):
        return False, "密码需要包含字母"
    if not re.search(r"[0-9]", password):
        return False, "密码需要包含数字"
    return True, "ok"

router = APIRouter()


class RegisterRequest(BaseModel):
    username: str
    password: str
    display_name: str
    email: str = ""


class LoginRequest(BaseModel):
    username: str
    password: str


class AuthResponse(BaseModel):
    token: str
    user: dict


@router.post("/register", response_model=AuthResponse)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    if len(req.username) < 3:
        raise HTTPException(status_code=400, detail="用户名至少3个字符")

    # 密码强度检查
    is_strong, msg = _is_strong_password(req.password)
    if not is_strong:
        raise HTTPException(status_code=400, detail=msg)

    if db.query(User).filter(User.username == req.username).first():
        raise HTTPException(status_code=409, detail="用户名已存在")

    user = User(
        username=req.username,
        password_hash=_hash_password(req.password),
        email=req.email or "",
        display_name=req.display_name,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="用户名已存在")
    db.refresh(user)

    token = create_token(user.id, user.username)
    return AuthResponse(token=token, user=_user_dict(user))


@router.post("/login", response_model=AuthResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    # 检查登录限制
    lock_error = check_login_attempt(req.username)
    if lock_error:
        raise HTTPException(status_code=429, detail=lock_error)

    user = db.query(User).filter(User.username == req.username).first()
    if not user or not _verify_password(req.password, user.password_hash):
        record_login_failure(req.username)
        raise HTTPException(status_code=401, detail="用户名或密码错误")

    # 登录成功，重置失败计数
    reset_login_attempt(req.username)

    token = create_token(user.id, user.username)
    return AuthResponse(token=token, user=_user_dict(user))


@router.get("/me")
def me(current_user: User = Depends(get_current_user)):
    return _user_dict(current_user)


@router.post("/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """上传用户头像"""
    import uuid
    from pathlib import Path
    from ..pack_config import get_data_dir

    # 校验文件类型
    ext = file.filename.rsplit(".", 1)[-1].lower() if file.filename else ""
    if ext not in ("png", "jpg", "jpeg", "gif", "webp"):
        raise HTTPException(status_code=400, detail="仅支持 png/jpg/gif/webp 格式")

    content = await file.read()
    if len(content) > 2 * 1024 * 1024:  # 2MB 限制
        raise HTTPException(status_code=400, detail="头像文件不能超过 2MB")
    if len(content) < 8:
        raise HTTPException(status_code=400, detail="文件内容无效")

    # 魔数校验：防止伪装扩展名上传非图片文件
    _AVATAR_MAGIC = {
        "png": b"\x89PNG\r\n\x1a\n",
        "jpg": b"\xff\xd8\xff",
        "jpeg": b"\xff\xd8\xff",
        "gif": b"GIF87a",  # GIF87a / GIF89a 前缀
        "webp": b"RIFF",
    }
    expected = _AVATAR_MAGIC.get(ext)
    # GIF 实际可能是 GIF89a
    if ext == "gif":
        if not content.startswith(b"GIF87a") and not content.startswith(b"GIF89a"):
            raise HTTPException(status_code=400, detail="文件内容与声明格式不符（GIF）")
    elif expected and not content.startswith(expected):
        raise HTTPException(status_code=400, detail="文件内容与声明格式不符")

    # 保存到 data/avatars/
    avatar_dir = get_data_dir() / "avatars"
    avatar_dir.mkdir(parents=True, exist_ok=True)
    filename = f"user_{current_user.id}_{uuid.uuid4().hex[:8]}.{ext}"
    filepath = avatar_dir / filename

    # 最终路径安全检查
    if not filepath.resolve().parent == avatar_dir.resolve():
        raise HTTPException(status_code=400, detail="文件路径校验失败")

    filepath.write_bytes(content)

    # 更新用户头像URL
    avatar_url = f"/api/auth/avatar/{filename}"
    current_user.avatar_url = avatar_url
    db.commit()

    return {"avatar_url": avatar_url}


# 允许的头像文件扩展名（与上传校验保持一致）
_AVATAR_ALLOWED_EXTS = ("png", "jpg", "jpeg", "gif", "webp")


@router.get("/avatar/{filename}")
def get_avatar(filename: str):
    """获取头像图片"""
    from pathlib import Path
    from ..pack_config import get_data_dir
    from fastapi.responses import FileResponse

    # 安全清洗：剥离任何路径分隔符，防止路径遍历（如 ../../config）
    safe_name = os.path.basename(filename)
    if not safe_name or safe_name != filename:
        raise HTTPException(status_code=400, detail="非法的文件名")

    # 校验扩展名
    ext = os.path.splitext(safe_name)[1].lower().lstrip(".")
    if ext not in _AVATAR_ALLOWED_EXTS:
        raise HTTPException(status_code=400, detail="不支持的文件类型")

    avatar_dir = get_data_dir() / "avatars"
    filepath = (avatar_dir / safe_name).resolve()
    # 确保 resolve 后仍在 avatars 目录内
    if not str(filepath).startswith(str(avatar_dir.resolve())):
        raise HTTPException(status_code=400, detail="非法的文件路径")
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="头像不存在")
    return FileResponse(str(filepath))


def _user_dict(u: User) -> dict:
    return {
        "id": u.id,
        "username": u.username,
        "display_name": u.display_name,
        "email": u.email or "",
        "avatar_url": u.avatar_url or "",
        "role": u.role,
    }
