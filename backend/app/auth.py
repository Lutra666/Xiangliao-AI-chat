from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import os
import secrets
import threading
from typing import Optional
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from . import config
from .database import get_db
from .models import User

security = HTTPBearer()

# 允许的 JWT 算法白名单（防止算法切换攻击）
ALLOWED_ALGORITHMS = ["HS256"]
# 登录失败记录（用于简单的速率限制）
_login_failures = {}
_login_lock = threading.Lock()
# 最大登录失败次数
MAX_LOGIN_FAILURES = 5
# 锁定时间（秒）
LOCKOUT_DURATION = 300


def create_token(user_id: int, username: str) -> str:
    """创建 JWT Token，使用安全的配置"""
    if not config.JWT_SECRET or len(config.JWT_SECRET) < 32:
        raise ValueError("JWT_SECRET 必须至少 32 个字符")

    payload = {
        "sub": str(user_id),
        "username": username,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=config.JWT_EXPIRES_HOURS),
        "iss": "deepchat-backend",  # 签发者
        "nbf": datetime.now(timezone.utc),  # 生效时间
    }
    return jwt.encode(payload, config.JWT_SECRET, algorithm=ALLOWED_ALGORITHMS[0])


def decode_token(token: str) -> dict:
    """安全解码 JWT Token"""
    try:
        # 明确指定算法列表，防止 none 算法攻击
        return jwt.decode(
            token,
            config.JWT_SECRET,
            algorithms=ALLOWED_ALGORITHMS,
            issuer="deepchat-backend",
            options={
                "verify_signature": True,
                "verify_exp": True,
                "verify_nbf": True,
                "verify_iss": True,
                "require": ["exp", "iat", "sub"],
            }
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="令牌已过期")
    except jwt.InvalidIssuerError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="无效的令牌签发者")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="无效令牌")


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """获取当前认证用户"""
    payload = decode_token(credentials.credentials)
    try:
        user_id = int(payload["sub"])
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="无效令牌")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户不存在")
    return user


def check_login_attempt(username: str) -> Optional[str]:
    """检查登录尝试是否被锁定，返回错误信息（如果被锁定）"""
    now = datetime.now(timezone.utc).timestamp()
    with _login_lock:
        # TTL 清理：移除超过锁定时长的旧记录，避免内存泄漏
        expired = [
            u for u, (c, t) in _login_failures.items()
            if now - t > LOCKOUT_DURATION
        ]
        for u in expired:
            del _login_failures[u]

        if username in _login_failures:
            count, lock_time = _login_failures[username]
            if count >= MAX_LOGIN_FAILURES:
                if now - lock_time < LOCKOUT_DURATION:
                    remaining = int(LOCKOUT_DURATION - (now - lock_time))
                    return f"登录失败次数过多，请 {remaining} 秒后再试"
                # 锁定超时，重置计数
                del _login_failures[username]
    return None


def record_login_failure(username: str):
    """记录登录失败"""
    now = datetime.now(timezone.utc).timestamp()
    with _login_lock:
        # 兜底清理：字典过大时清理最早的记录，防止内存泄漏
        if len(_login_failures) > 10000:
            sorted_items = sorted(_login_failures.items(), key=lambda kv: kv[1][1])
            for u, _ in sorted_items[: len(_login_failures) // 2]:
                del _login_failures[u]

        if username in _login_failures:
            count, _ = _login_failures[username]
            _login_failures[username] = (count + 1, now)
        else:
            _login_failures[username] = (1, now)


def reset_login_attempt(username: str):
    """重置登录尝试计数（登录成功后调用）"""
    with _login_lock:
        if username in _login_failures:
            del _login_failures[username]


def constant_time_compare(a: str, b: str) -> bool:
    """恒时字符串比较，防止时序攻击"""
    return hmac.compare_digest(a.encode(), b.encode())
