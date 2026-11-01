# -*- coding: utf-8 -*-
"""
数据库优化模块 - 连接池优化、查询优化、性能监控

功能：
- 优化的数据库连接池配置
- 查询性能监控
- 便捷的分页工具
- 数据库健康检查
"""
import time
import logging
from contextlib import contextmanager
from functools import wraps
from typing import Any, Callable, Dict, List, Optional, TypeVar, Generic

from sqlalchemy import event, text
from sqlalchemy.orm import Query, Session

from ..database import engine, SessionLocal
from .metrics import get_metrics_collector

logger = logging.getLogger("deepchat.database")
metrics = get_metrics_collector()

# 类型变量
T = TypeVar("T")


class Paginator(Generic[T]):
    """
    分页工具 - 提供标准化的分页查询和响应格式

    用法：
        paginator = Paginator(query, page=1, page_size=20)
        result = paginator.paginate(db)
    """

    def __init__(
        self,
        query: Query,
        page: int = 1,
        page_size: int = 20,
        max_page_size: int = 100,
    ):
        self.query = query
        self.page = max(1, page)
        self.page_size = min(max(1, page_size), max_page_size)
        self.max_page_size = max_page_size

    def paginate(self, db: Session) -> Dict[str, Any]:
        """执行分页查询"""
        offset = (self.page - 1) * self.page_size

        # 获取总数
        total = self.query.count()

        # 获取当前页数据
        items = (
            self.query
            .offset(offset)
            .limit(self.page_size)
            .all()
        )

        total_pages = (total + self.page_size - 1) // self.page_size

        return {
            "items": items,
            "pagination": {
                "page": self.page,
                "page_size": self.page_size,
                "total_items": total,
                "total_pages": total_pages,
                "has_next": self.page < total_pages,
                "has_prev": self.page > 1,
            },
        }


def monitor_sql_queries():
    """
    安装 SQL 查询监控 - 记录慢查询

    慢查询阈值：100ms
    """
    SLOW_QUERY_THRESHOLD = 0.1  # 100ms

    @event.listens_for(engine, "before_cursor_execute")
    def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        conn.info["query_start_time"] = time.perf_counter()

    @event.listens_for(engine, "after_cursor_execute")
    def after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        if "query_start_time" in conn.info:
            duration = time.perf_counter() - conn.info["query_start_time"]
            metrics.record_timing("database.query", duration)

            # 记录慢查询
            if duration > SLOW_QUERY_THRESHOLD:
                logger.warning(
                    "慢查询检测: %.2fms\nSQL: %s\nParams: %s",
                    duration * 1000,
                    statement[:200],
                    str(parameters)[:100],
                )


@contextmanager
def db_session(commit: bool = False) -> Session:
    """
    数据库会话上下文管理器

    用法：
        with db_session(commit=True) as db:
            db.add(user)
    """
    db = SessionLocal()
    try:
        yield db
        if commit:
            db.commit()
    except Exception:
        if commit:
            db.rollback()
        raise
    finally:
        db.close()


def transactional(func: Callable) -> Callable:
    """
    事务装饰器 - 自动管理数据库事务

    用法：
        @transactional
        def create_user(db, data):
            ...
    """
    @wraps(func)
    def wrapper(*args, **kwargs):
        # 从参数中获取 db 会话
        db = None
        for arg in args:
            if isinstance(arg, Session):
                db = arg
                break
        for key, value in kwargs.items():
            if isinstance(value, Session):
                db = value
                break

        if db is None:
            # 没有找到 db，创建新的会话
            with db_session(commit=True) as new_db:
                kwargs["db"] = new_db
                return func(*args, **kwargs)

        # 使用现有会话
        try:
            result = func(*args, **kwargs)
            db.commit()
            return result
        except Exception:
            db.rollback()
            raise

    return wrapper


def check_database_health() -> Dict[str, Any]:
    """
    检查数据库健康状态

    返回：
        {
            "healthy": bool,
            "latency_ms": float,
            "error": str | None
        }
    """
    try:
        start = time.perf_counter()
        with db_session() as db:
            db.execute(text("SELECT 1")).fetchone()
        latency_ms = (time.perf_counter() - start) * 1000
        return {
            "healthy": True,
            "latency_ms": round(latency_ms, 2),
            "error": None,
        }
    except Exception as e:
        return {
            "healthy": False,
            "latency_ms": None,
            "error": str(e),
        }


def bulk_insert(db: Session, model, data: List[Dict], batch_size: int = 1000) -> int:
    """
    批量插入数据优化

    Args:
        db: 数据库会话
        model: 模型类
        data: 数据字典列表
        batch_size: 每批大小

    Returns:
        插入的记录数
    """
    count = 0
    for i in range(0, len(data), batch_size):
        batch = data[i:i + batch_size]
        db.bulk_insert_mappings(model, batch)
        count += len(batch)
    return count


def optimize_query(
    query: Query,
    select_in: Optional[List[str]] = None,
    joined_load: Optional[List[str]] = None,
    defer: Optional[List[str]] = None,
) -> Query:
    """
    查询优化工具 - 自动应用优化策略

    Args:
        query: 原始查询
        select_in: 需要 select_in_load 的关系列表
        joined_load: 需要 joined_load 的关系列表
        defer: 需要延迟加载的字段列表

    Returns:
        优化后的查询
    """
    from sqlalchemy.orm import selectinload, joinedload, defer as defer_field

    if select_in:
        for rel in select_in:
            query = query.options(selectinload(rel))

    if joined_load:
        for rel in joined_load:
            query = query.options(joinedload(rel))

    if defer:
        for field in defer:
            query = query.options(defer_field(field))

    return query


# 初始化查询监控
monitor_sql_queries()
