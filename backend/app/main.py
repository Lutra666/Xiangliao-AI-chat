"""
享聊 — AI 即时聊天软件 后端入口

已升级特性：
- ✅ 结构化日志系统
- ✅ 统一异常处理
- ✅ 性能指标收集
- ✅ 数据库查询监控
- ✅ CORS 安全验证
- ✅ 健康检查端点
"""
import asyncio
import os as _os
import sys
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, Request, status, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import (
    CORS_ORIGINS,
    DEBUG,
    DEEPSEEK_API_KEY,
    JWT_SECRET,
    DATABASE_URL,
    LOG_LEVEL,
    LOG_FILE,
    LOG_JSON_FORMAT,
)
from .core.logging import setup_logging, get_logger
from .core.exceptions import setup_exception_handlers
from .core.metrics import get_metrics_collector, timer
from .core.database import check_database_health
from .database import init_db, SessionLocal
from .routers import auth, chat, characters, settings, memory
from .auth import get_current_user
from .models import User
from .pack_config import get_frontend_dir
from .services.memory_engine import init_memory_engine

# 初始化日志系统
setup_logging(
    log_level=LOG_LEVEL,
    log_file=LOG_FILE,
    json_output=LOG_JSON_FORMAT,
)
logger = get_logger("deepchat")
metrics = get_metrics_collector()

# JWT_SECRET 开发模式自动生成
_jwt = JWT_SECRET
if not _jwt:
    import secrets
    _jwt = secrets.token_hex(32)
    _os.environ["JWT_SECRET"] = _jwt
    # 需要更新 config 模块中的值
    from . import config
    config.JWT_SECRET = _jwt
    logger.warning("⚠ JWT_SECRET 未配置，已自动生成临时密钥（重启后失效，已登录用户需重新登录）")

if not DEEPSEEK_API_KEY:
    logger.warning("⚠ DEEPSEEK_API_KEY 未配置！AI对话功能不可用，请编辑 backend/.env 填入 API Key")
    _os.environ["DEEPSEEK_API_KEY"] = "sk-placeholder"
    from . import config
    config.DEEPSEEK_API_KEY = "sk-placeholder"

# 创建 FastAPI 应用
@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期：启动时初始化，停止时收尾（替代废弃的 on_event）"""
    logger.info("正在启动享聊服务...")

    with timer("startup.database"):
        init_db()
    logger.info("Database initialized successfully")

    with timer("startup.memory_engine"):
        init_memory_engine(lambda: SessionLocal())
    logger.info("Memory engine initialized successfully")

    logger.info("XiangLiao service started successfully, version 2.0.0")

    yield

    # ── shutdown ──
    logger.info("享聊服务正在关闭...")


app = FastAPI(
    title="享聊 API",
    description="AI 即时聊天软件后端接口",
    version="2.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan,
)

# 安装异常处理器
setup_exception_handlers(app)


def _is_valid_origin(origin: str) -> bool:
    """验证来源是否在白名单中，支持本地开发环境和局域网访问"""
    if not origin:
        return False

    # 精确匹配
    if origin in CORS_ORIGINS:
        return True

    # 仅在 DEBUG 模式下支持本地/局域网环境的动态端口（localhost / 127.0.0.1 / 内网IP）
    import re
    if DEBUG and re.match(
        r'^https?://(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+):\d+$',
        origin,
    ):
        for allowed in CORS_ORIGINS:
            if any(net in allowed for net in ('localhost', '127.0.0.1')):
                return True

    return False


@app.middleware("http")
async def request_tracking_middleware(request: Request, call_next):
    """
    请求追踪中间件
    - 生成请求 ID
    - 记录请求日志和耗时
    - 添加安全响应头
    - CORS 来源验证
    """
    request_id = str(uuid.uuid4())
    start_time = time.perf_counter()
    request.state.request_id = request_id

    # CORS 来源验证
    origin = request.headers.get("origin")
    if origin and not _is_valid_origin(origin):
        logger.warning(
            "拒绝未授权的跨域请求",
            extra={"origin": origin, "path": request.url.path, "request_id": request_id},
        )
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"error": {"code": "FORBIDDEN", "message": "不允许的跨域请求来源"}},
        )

    try:
        response = await call_next(request)
        duration_ms = int((time.perf_counter() - start_time) * 1000)

        # 记录请求指标
        metrics.record_timing("http_request", time.perf_counter() - start_time)

        # 添加响应头
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Response-Time"] = str(duration_ms)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"

        # 记录访问日志
        level = "info" if response.status_code < 400 else "warning"
        getattr(logger, level)(
            "%s %s",
            request.method,
            request.url.path,
            extra={
                "request_id": request_id,
                "status": response.status_code,
                "duration_ms": duration_ms,
                "user_agent": request.headers.get("user-agent", ""),
                "ip": request.client.host if request.client else None,
            },
        )

        return response
    except Exception as e:
        duration_ms = int((time.perf_counter() - start_time) * 1000)
        logger.error(
            "请求处理失败: %s %s",
            request.method,
            request.url.path,
            extra={
                "request_id": request_id,
                "duration_ms": duration_ms,
                "error": str(e),
            },
            exc_info=True,
        )
        raise


app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID", "X-Response-Time"],
)

# ── 路由注册 ──
app.include_router(auth.router, prefix="/api/auth", tags=["认证"])
app.include_router(chat.router, prefix="/api/chat", tags=["对话"])
app.include_router(characters.router, prefix="/api/characters", tags=["角色"])
app.include_router(settings.router, prefix="/api/settings", tags=["设置"])
app.include_router(memory.router, prefix="/api/memory", tags=["记忆"])


@app.get("/api/health", summary="健康检查")
async def health_check():
    """
    服务健康检查端点

    返回服务状态、数据库状态、运行时间等信息
    """
    db_health = await asyncio.to_thread(check_database_health)
    metrics_stats = metrics.get_stats()

    return {
        "status": "healthy" if db_health["healthy"] else "degraded",
        "version": "2.0.0",
        "service": "享聊 API",
        "database": db_health,
        "uptime": metrics_stats["uptime"],
        "timestamp": datetime.now().isoformat(),
    }


@app.get("/api/metrics", summary="性能指标")
async def get_metrics(user: User = Depends(get_current_user)):
    """
    获取性能指标统计（P95/P99 响应时间、请求计数等）
    """
    return metrics.get_stats()


@app.get("/api/version", summary="版本信息")
def version():
    return {
        "name": "享聊",
        "version": "2.0.0",
        "model": "DeepSeek",
        "features": [
            "结构化日志",
            "性能指标收集",
            "数据库查询监控",
            "统一异常处理",
        ],
    }


# ── 前端静态文件 ──
_FRONTEND_DIR = get_frontend_dir()
if _FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(_FRONTEND_DIR), html=True), name="frontend")
else:
    logger.info("前端目录不存在，仅提供 API 服务")
