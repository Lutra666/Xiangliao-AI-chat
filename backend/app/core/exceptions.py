# -*- coding: utf-8 -*-
"""
统一异常处理 - 定义应用层级的异常和处理器

所有业务异常都应该继承自 AppException，
以便中间件能够统一处理和返回标准格式的错误响应。
"""
from typing import Any, Dict, Optional
from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from sqlalchemy.exc import SQLAlchemyError


class AppException(Exception):
    """应用基础异常类"""

    status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR
    code: str = "INTERNAL_ERROR"
    message: str = "服务器内部错误"

    def __init__(
        self,
        message: Optional[str] = None,
        code: Optional[str] = None,
        status_code: Optional[int] = None,
        details: Optional[Dict[str, Any]] = None,
    ):
        if message is not None:
            self.message = message
        if code is not None:
            self.code = code
        if status_code is not None:
            self.status_code = status_code
        self.details = details or {}
        super().__init__(self.message)

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典格式"""
        result = {
            "code": self.code,
            "message": self.message,
        }
        if self.details:
            result["details"] = self.details
        return result


class NotFoundException(AppException):
    """资源未找到异常"""
    status_code = status.HTTP_404_NOT_FOUND
    code = "NOT_FOUND"
    message = "资源不存在"


class UnauthorizedException(AppException):
    """未授权异常"""
    status_code = status.HTTP_401_UNAUTHORIZED
    code = "UNAUTHORIZED"
    message = "未授权访问"


class ForbiddenException(AppException):
    """禁止访问异常"""
    status_code = status.HTTP_403_FORBIDDEN
    code = "FORBIDDEN"
    message = "无权限访问"


class ValidationException(AppException):
    """参数验证异常"""
    status_code = status.HTTP_400_BAD_REQUEST
    code = "VALIDATION_ERROR"
    message = "参数验证失败"


class BusinessException(AppException):
    """业务逻辑异常"""
    status_code = status.HTTP_400_BAD_REQUEST
    code = "BUSINESS_ERROR"
    message = "业务操作失败"


class RateLimitException(AppException):
    """限流异常"""
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    code = "RATE_LIMITED"
    message = "请求过于频繁，请稍后再试"


class ExternalServiceException(AppException):
    """外部服务异常"""
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    code = "EXTERNAL_SERVICE_ERROR"
    message = "外部服务暂时不可用"


async def exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    全局异常处理器

    处理所有未捕获的异常，返回统一格式的错误响应：
    {
        "error": {
            "code": "ERROR_CODE",
            "message": "错误描述",
            "details": {},
            "request_id": "uuid"
        }
    }
    """
    import logging
    import uuid

    logger = logging.getLogger("deepchat.exception")
    request_id = getattr(request.state, "request_id", None) or str(uuid.uuid4())

    # 处理应用自定义异常
    if isinstance(exc, AppException):
        logger.warning(
            "[%s] %s %s - %s",
            request_id,
            request.method,
            request.url.path,
            exc.message,
            extra={"details": exc.details, "code": exc.code},
        )
        response = exc.to_dict()
        response["request_id"] = request_id
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": response},
        )

    # 处理 Pydantic 验证异常
    if isinstance(exc, RequestValidationError):
        errors = []
        for err in exc.errors():
            errors.append({
                "field": " -> ".join(str(loc) for loc in err["loc"]),
                "message": err["msg"],
                "type": err["type"],
            })
        logger.warning(
            "[%s] Validation error: %s",
            request_id,
            errors,
        )
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "请求参数验证失败",
                    "details": errors,
                    "request_id": request_id,
                }
            },
        )

    # 处理数据库异常
    if isinstance(exc, SQLAlchemyError):
        logger.error(
            "[%s] Database error: %s",
            request_id,
            str(exc),
            exc_info=True,
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": {
                    "code": "DATABASE_ERROR",
                    "message": "数据库操作失败",
                    "request_id": request_id,
                }
            },
        )

    # 处理未知异常
    logger.error(
        "[%s] Unhandled exception: %s %s",
        request_id,
        type(exc).__name__,
        str(exc),
        exc_info=True,
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "服务器内部错误",
                "request_id": request_id,
            }
        },
    )


def setup_exception_handlers(app):
    """为 FastAPI 应用注册异常处理器"""
    from fastapi import FastAPI

    # 注册自定义异常处理器
    @app.exception_handler(AppException)
    async def app_exception_handler(request: Request, exc: AppException):
        return await exception_handler(request, exc)

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        return await exception_handler(request, exc)

    @app.exception_handler(SQLAlchemyError)
    async def sqlalchemy_exception_handler(request: Request, exc: SQLAlchemyError):
        return await exception_handler(request, exc)

    @app.exception_handler(Exception)
    async def general_exception_handler(request: Request, exc: Exception):
        return await exception_handler(request, exc)
