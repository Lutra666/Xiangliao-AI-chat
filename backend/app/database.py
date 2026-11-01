"""
数据库配置 - 已优化连接池和性能

升级特性：
- ✅ 可配置的连接池参数
- ✅ 连接有效性检查（pool_pre_ping）
- ✅ 悲观连接回收机制
- ✅ SQLite 性能优化（WAL 模式）
- ✅ 支持异步数据库引擎（预留）
"""
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base
from .config import (
    DATABASE_URL,
    DB_POOL_SIZE,
    DB_MAX_OVERFLOW,
    DB_POOL_RECYCLE,
    DEBUG,
)

# 根据数据库类型优化配置
is_sqlite = DATABASE_URL.startswith("sqlite://")
is_mysql = DATABASE_URL.startswith("mysql+pymysql://")

# 基础引擎配置
engine_kwargs = {
    "pool_pre_ping": True,       # 每次使用前检查连接有效性
    "pool_recycle": DB_POOL_RECYCLE,  # 连接回收时间
    "echo": DEBUG and False,     # 调试模式下可开启 SQL 日志
}

if is_sqlite:
    # SQLite 特殊优化
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    # MySQL 连接池配置
    engine_kwargs.update({
        "pool_size": DB_POOL_SIZE,
        "max_overflow": DB_MAX_OVERFLOW,
        "pool_timeout": 30,
        "isolation_level": "READ COMMITTED",  # 降低隔离级别提升并发
    })

engine = create_engine(DATABASE_URL, **engine_kwargs)

# SQLite WAL 模式优化 —— 必须在 engine 创建之后注册事件
if is_sqlite:
    def _set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA temp_store=MEMORY")
        cursor.execute("PRAGMA mmap_size=268435456")  # 256MB
        cursor.close()
    event.listen(engine, "connect", _set_sqlite_pragma)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    expire_on_commit=False,  # 提交后不失效，提升性能
)

Base = declarative_base()


def get_db():
    """FastAPI 依赖注入 - 获取数据库会话"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """初始化数据库表"""
    from . import models  # noqa: F401
    Base.metadata.create_all(bind=engine)
