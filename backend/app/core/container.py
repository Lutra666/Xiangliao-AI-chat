# -*- coding: utf-8 -*-
"""
依赖注入容器 - 管理应用的核心服务依赖

使用简单的单例模式管理服务生命周期，避免循环依赖
"""
from typing import Any, Callable, Dict, Type, TypeVar, Optional
from contextlib import contextmanager

from sqlalchemy.orm import Session

from ..database import SessionLocal
from ..services.memory_engine import MemoryEngine, get_memory_engine

T = TypeVar("T")


class Container:
    """
    简单的依赖注入容器

    用法：
        container = Container()
        db = container.get_db()
        memory = container.get_memory_engine()
    """

    def __init__(self):
        self._services: Dict[Type, Any] = {}
        self._factories: Dict[Type, Callable[[], Any]] = {}
        self._singletons: Dict[Type, Any] = {}

    def register(self, service_type: Type[T], instance: T) -> None:
        """注册单例服务"""
        self._singletons[service_type] = instance

    def register_factory(self, service_type: Type[T], factory: Callable[[], T]) -> None:
        """注册服务工厂函数"""
        self._factories[service_type] = factory

    def get(self, service_type: Type[T]) -> T:
        """获取服务实例"""
        if service_type in self._singletons:
            return self._singletons[service_type]

        if service_type in self._factories:
            return self._factories[service_type]()

        raise ValueError(f"未注册的服务类型: {service_type}")

    @contextmanager
    def get_db(self) -> Session:
        """
        获取数据库会话上下文管理器

        用法：
            with container.get_db() as db:
                user = db.query(User).get(1)
        """
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    def get_memory_engine(self) -> Optional[MemoryEngine]:
        """获取记忆引擎"""
        return get_memory_engine()

    def clear_singletons(self) -> None:
        """清空所有单例（用于测试）"""
        self._singletons.clear()


# 全局容器实例
_container: Optional[Container] = None


def get_container() -> Container:
    """获取全局容器实例"""
    global _container
    if _container is None:
        _container = Container()
    return _container


def set_container(container: Container) -> None:
    """设置全局容器（用于测试）"""
    global _container
    _container = container
