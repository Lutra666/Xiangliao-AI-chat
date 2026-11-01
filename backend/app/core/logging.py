# -*- coding: utf-8 -*-
"""
结构化日志系统 - JSON格式日志输出

特性：
- JSON 格式化输出，便于日志采集和分析
- 不同日志级别使用不同颜色（控制台）
- 自动记录请求ID、用户ID、耗时等上下文
- 支持文件和控制台双输出
"""
import logging
import logging.handlers  # 导入 handlers 子模块
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

# JSON 日志库是可选依赖
try:
    from pythonjsonlogger import jsonlogger
    JSON_LOGGING_AVAILABLE = True
except ImportError:
    jsonlogger = None
    JSON_LOGGING_AVAILABLE = False


class CustomJsonFormatter:
    """自定义 JSON 日志格式化器（适配可选依赖）"""

    def __new__(cls, *args, **kwargs):
        if jsonlogger is not None:
            return _JsonFormatterImpl(*args, **kwargs)
        # 降级为标准格式化器
        return logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")


class _JsonFormatterImpl(jsonlogger.JsonFormatter if jsonlogger else object):
    """实际 JSON 格式化器实现"""

    def __init__(self, fmt=None, include_traceback=True, **kwargs):
        if jsonlogger is not None:
            super().__init__(fmt or "%(message)s", **kwargs)
        self.include_traceback = include_traceback

    def add_fields(self, log_record, record, message_dict):
        if jsonlogger is not None:
            super().add_fields(log_record, record, message_dict)
        else:
            log_record["message"] = record.getMessage()

        # 标准字段
        log_record["timestamp"] = datetime.fromtimestamp(
            record.created, tz=timezone.utc
        ).isoformat()
        log_record["level"] = record.levelname
        log_record["logger"] = record.name
        log_record["module"] = record.module
        log_record["function"] = record.funcName
        log_record["line"] = record.lineno

        # 进程/线程信息
        log_record["process_id"] = record.process
        log_record["thread_id"] = record.thread

        # 异常信息
        if record.exc_info and self.include_traceback:
            log_record["exception"] = self.formatException(record.exc_info)

        # 移除空值
        for key in list(log_record.keys()):
            if log_record[key] is None:
                del log_record[key]


class ColoredConsoleFormatter(logging.Formatter):
    """带颜色的控制台日志格式化器"""

    COLORS = {
        logging.DEBUG: "\033[36m",    # 青色
        logging.INFO: "\033[32m",     # 绿色
        logging.WARNING: "\033[33m",  # 黄色
        logging.ERROR: "\033[31m",    # 红色
        logging.CRITICAL: "\033[35m", # 洋红色
    }
    RESET = "\033[0m"

    def format(self, record):
        color = self.COLORS.get(record.levelno, self.RESET)
        level = f"{color}{record.levelname:8}{self.RESET}"

        timestamp = datetime.fromtimestamp(
            record.created, tz=timezone.utc
        ).strftime("%Y-%m-%d %H:%M:%S")

        message = super().format(record)

        # 添加额外字段
        extra = ""
        if hasattr(record, "user_id"):
            extra += f" user={record.user_id}"
        if hasattr(record, "request_id"):
            extra += f" req={record.request_id[:8]}"
        if hasattr(record, "duration_ms"):
            extra += f" ({record.duration_ms}ms)"

        return f"[{timestamp}] {level} {record.name:20} {message}{extra}"


def setup_logging(
    log_level: str = "INFO",
    log_file: Optional[str] = None,
    json_output: bool = False,
):
    """
    配置全局日志系统

    Args:
        log_level: 日志级别 (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        log_file: 日志文件路径（可选）
        json_output: 是否输出 JSON 格式（生产环境推荐）
    """
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level.upper())

    # 清除已有处理器
    root_logger.handlers.clear()

    # 控制台输出
    console_handler = logging.StreamHandler(sys.stdout)
    if json_output and JSON_LOGGING_AVAILABLE:
        console_handler.setFormatter(CustomJsonFormatter(
            "%(timestamp)s %(level)s %(name)s %(message)s"
        ))
    else:
        # 降级使用彩色控制台输出（默认）
        console_handler.setFormatter(ColoredConsoleFormatter("%(message)s"))
    root_logger.addHandler(console_handler)

    # 文件输出（如果配置了）
    if log_file:
        log_path = Path(log_file)
        log_path.parent.mkdir(parents=True, exist_ok=True)

        file_handler = logging.handlers.RotatingFileHandler(
            log_file,
            maxBytes=100 * 1024 * 1024,  # 100MB
            backupCount=5,
            encoding="utf-8",
        )
        if JSON_LOGGING_AVAILABLE:
            file_handler.setFormatter(CustomJsonFormatter())
        else:
            file_handler.setFormatter(logging.Formatter(
                "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
            ))
        root_logger.addHandler(file_handler)

    # 降低第三方库的日志级别
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """获取日志记录器"""
    return logging.getLogger(name)


class LogContext:
    """日志上下文管理器 - 记录请求处理的上下文信息"""

    def __init__(self, logger: logging.Logger, **context):
        self.logger = logger
        self.context = context
        self.start_time = None

    def __enter__(self):
        self.start_time = time.perf_counter()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        duration_ms = int((time.perf_counter() - self.start_time) * 1000)
        extra = dict(self.context)
        extra["duration_ms"] = duration_ms

        if exc_type is not None:
            self.logger.error(
                "处理失败",
                extra={**extra, "error": str(exc_val) if exc_val else None},
                exc_info=(exc_type, exc_val, exc_tb),
            )
        else:
            self.logger.debug("处理完成", extra=extra)

    def info(self, message: str, **kwargs):
        self.logger.info(message, extra={**self.context, **kwargs})

    def warning(self, message: str, **kwargs):
        self.logger.warning(message, extra={**self.context, **kwargs})

    def error(self, message: str, **kwargs):
        self.logger.error(message, extra={**self.context, **kwargs})


def log_with_context(logger_name: str, **context) -> LogContext:
    """创建带上下文的日志记录器"""
    return LogContext(logging.getLogger(logger_name), **context)
