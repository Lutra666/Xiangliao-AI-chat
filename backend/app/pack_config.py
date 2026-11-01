"""
打包/开发环境自适应：
- 开发模式：数据/模型/前端路径相对于 backend/ 目录
- PyInstaller 模式：数据存 %APPDATA%/CampusQA/，前端从 sys._MEIPASS 读取
"""
import os
import sys
from pathlib import Path


def _is_frozen() -> bool:
    """是否在 PyInstaller 打包环境中运行"""
    return getattr(sys, "frozen", False)


def get_base_dir() -> Path:
    """项目根目录：开发模式 = backend/，打包模式 = sys._MEIPASS"""
    if _is_frozen():
        return Path(sys._MEIPASS)
    return Path(__file__).resolve().parent.parent


def get_data_dir() -> Path:
    """数据存储目录"""
    if _is_frozen():
        p = Path(os.getenv("APPDATA", os.path.expanduser("~"))) / "CampusQA"
    else:
        p = get_base_dir() / "data"
    p.mkdir(parents=True, exist_ok=True)
    return p


def get_upload_dir() -> Path:
    """文件上传目录"""
    if _is_frozen():
        p = get_data_dir() / "uploads"
    else:
        p = get_base_dir() / "uploads"
    p.mkdir(parents=True, exist_ok=True)
    return p


def get_frontend_dir() -> Path:
    """前端 dist 目录"""
    if _is_frozen():
        return get_base_dir() / "frontend" / "dist"
    return get_base_dir().parent / "frontend" / "dist"


def get_env_path() -> Path:
    """.env 配置文件路径"""
    if _is_frozen():
        return get_data_dir() / ".env"
    return get_base_dir() / ".env"


def get_model_cache_dir() -> Path:
    """嵌入模型缓存目录"""
    if _is_frozen():
        p = get_data_dir() / "models"
    else:
        p = get_base_dir() / "models"
    p.mkdir(parents=True, exist_ok=True)
    return p
