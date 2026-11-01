# -*- coding: utf-8 -*-
"""
性能指标收集 - 监控应用性能和资源使用

收集：
- API 请求计数和耗时
- LLM 调用次数、耗时、Token 用量
- 数据库查询耗时
- 内存使用情况
"""
import time
import threading
from collections import defaultdict
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from functools import wraps


@dataclass
class TimerMetric:
    """计时器指标"""
    count: int = 0
    total_time: float = 0.0
    max_time: float = 0.0
    min_time: float = float("inf")
    recent_times: List[float] = field(default_factory=lambda: [])

    def record(self, duration: float):
        """记录一次耗时"""
        self.count += 1
        self.total_time += duration
        self.max_time = max(self.max_time, duration)
        self.min_time = min(self.min_time, duration)
        self.recent_times.append(duration)
        # 只保留最近 100 次数据用于计算 P95/P99
        if len(self.recent_times) > 100:
            self.recent_times.pop(0)

    @property
    def avg_time(self) -> float:
        return self.total_time / self.count if self.count > 0 else 0.0

    @property
    def p95_time(self) -> float:
        if not self.recent_times:
            return 0.0
        sorted_times = sorted(self.recent_times)
        idx = int(len(sorted_times) * 0.95)
        return sorted_times[min(idx, len(sorted_times) - 1)]

    @property
    def p99_time(self) -> float:
        if not self.recent_times:
            return 0.0
        sorted_times = sorted(self.recent_times)
        idx = int(len(sorted_times) * 0.99)
        return sorted_times[min(idx, len(sorted_times) - 1)]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "count": self.count,
            "avg_ms": round(self.avg_time * 1000, 2),
            "max_ms": round(self.max_time * 1000, 2),
            "min_ms": round(self.min_time * 1000 if self.min_time != float("inf") else 0, 2),
            "p95_ms": round(self.p95_time * 1000, 2),
            "p99_ms": round(self.p99_time * 1000, 2),
            "total_seconds": round(self.total_time, 2),
        }


@dataclass
class CounterMetric:
    """计数器指标"""
    value: int = 0

    def increment(self, amount: int = 1):
        self.value += amount

    def to_dict(self) -> Dict[str, Any]:
        return {"value": self.value}


class MetricsCollector:
    """指标收集器 - 线程安全"""

    def __init__(self):
        self._timers: Dict[str, TimerMetric] = defaultdict(TimerMetric)
        self._counters: Dict[str, CounterMetric] = defaultdict(CounterMetric)
        self._lock = threading.Lock()
        self._start_time = time.time()

    @contextmanager
    def timer(self, name: str):
        """计时器上下文管理器"""
        start = time.perf_counter()
        try:
            yield
        finally:
            duration = time.perf_counter() - start
            with self._lock:
                self._timers[name].record(duration)

    def timed(self, name: Optional[str] = None):
        """装饰器 - 记录函数执行时间"""
        def decorator(func):
            metric_name = name or f"{func.__module__}.{func.__name__}"
            @wraps(func)
            def wrapper(*args, **kwargs):
                with self.timer(metric_name):
                    return func(*args, **kwargs)
            return wrapper
        return decorator

    def count(self, name: str, amount: int = 1):
        """增加计数器"""
        with self._lock:
            self._counters[name].increment(amount)

    def record_timing(self, name: str, duration: float):
        """记录单次耗时（用于非上下文管理器场景）"""
        with self._lock:
            self._timers[name].record(duration)

    def get_stats(self) -> Dict[str, Any]:
        """获取所有指标统计"""
        with self._lock:
            uptime_seconds = time.time() - self._start_time
            return {
                "uptime": {
                    "seconds": round(uptime_seconds, 2),
                    "human": str(timedelta(seconds=int(uptime_seconds))),
                },
                "timers": {k: v.to_dict() for k, v in self._timers.items()},
                "counters": {k: v.to_dict() for k, v in self._counters.items()},
            }

    def reset(self):
        """重置所有指标"""
        with self._lock:
            self._timers.clear()
            self._counters.clear()
            self._start_time = time.time()


# 全局指标收集器实例
_collector = MetricsCollector()


def get_metrics_collector() -> MetricsCollector:
    """获取全局指标收集器"""
    return _collector


def timer(name: str):
    """便捷函数 - 计时器上下文"""
    return _collector.timer(name)


def timed(name: Optional[str] = None):
    """便捷函数 - 计时装饰器"""
    return _collector.timed(name)


def count(name: str, amount: int = 1):
    """便捷函数 - 增加计数器"""
    _collector.count(name, amount)


def record_timing(name: str, duration: float):
    """便捷函数 - 记录单次耗时"""
    _collector.record_timing(name, duration)


def get_stats() -> Dict[str, Any]:
    """便捷函数 - 获取指标统计"""
    return _collector.get_stats()
