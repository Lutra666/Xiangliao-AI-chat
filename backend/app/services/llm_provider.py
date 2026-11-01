# -*- coding: utf-8 -*-
"""
可插拔 LLM Provider 架构

支持的后端:
- deepseek: DeepSeek 官方 API
- volcengine: 火山引擎 CodePlan (doubao-seed)
- openai: OpenAI 兼容接口（通用）

设计原则:
1. 统一的接口抽象
2. 工厂模式动态创建
3. 支持流式/非流式调用
4. 统一的 Token 用量统计
5. 优雅降级和错误处理
"""
import abc
import asyncio
import json
import logging
import time
from typing import AsyncGenerator, Dict, List, Optional, Any
from dataclasses import dataclass

import httpx
from openai import AsyncOpenAI

from ..config import (
    # DeepSeek 配置
    DEEPSEEK_API_KEY,
    DEEPSEEK_BASE_URL,
    DEEPSEEK_MODEL,
    DEEPSEEK_TIMEOUT,
    # 火山引擎配置（新增加）
    VOLCENGINE_API_KEY,
    VOLCENGINE_BASE_URL,
    VOLCENGINE_MODEL,
    VOLCENGINE_TIMEOUT,
    # 全局配置
    LLM_PROVIDER,
)

logger = logging.getLogger(__name__)


@dataclass
class LLMResponse:
    """LLM 响应统一封装"""
    content: str
    model: str
    usage: Dict[str, int]  # prompt_tokens, completion_tokens, total_tokens
    finish_reason: Optional[str] = None
    raw_response: Any = None


@dataclass
class StreamChunk:
    """流式响应块"""
    content: str
    finish_reason: Optional[str] = None
    usage: Optional[Dict[str, int]] = None


class BaseLLMProvider(abc.ABC):
    """LLM Provider 抽象基类"""

    @abc.abstractmethod
    async def chat_completion(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 2048,
        top_p: float = 0.95,
        **kwargs,
    ) -> LLMResponse:
        """非流式对话补全"""
        pass

    @abc.abstractmethod
    async def chat_completion_stream(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 2048,
        top_p: float = 0.95,
        **kwargs,
    ) -> AsyncGenerator[StreamChunk, None]:
        """流式对话补全"""
        pass

    @property
    @abc.abstractmethod
    def model_name(self) -> str:
        """当前使用的模型名称"""
        pass


class OpenAICompatibleProvider(BaseLLMProvider):
    """通用 OpenAI 兼容接口 Provider（所有 Provider 的统一实现）"""

    def __init__(self, api_key: str, base_url: str, model: str, timeout: int = 60):
        self._api_key = api_key
        self._base_url = base_url
        self._model = model
        self._timeout = timeout
        self._client: Optional[AsyncOpenAI] = None
        self._client_lock = asyncio.Lock()

    async def _get_client(self) -> AsyncOpenAI:
        if self._client is None:
            async with self._client_lock:
                if self._client is None:
                    self._client = AsyncOpenAI(
                        api_key=self._api_key,
                        base_url=self._base_url,
                        timeout=self._timeout,
                    )
        return self._client

    @property
    def model_name(self) -> str:
        return self._model

    async def chat_completion(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 2048,
        top_p: float = 0.95,
        **kwargs,
    ) -> LLMResponse:
        client = await self._get_client()
        response = await client.chat.completions.create(
            model=self._model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            top_p=top_p,
            stream=False,
            **kwargs,
        )
        return LLMResponse(
            content=response.choices[0].message.content or "",
            model=response.model,
            usage={
                "prompt_tokens": response.usage.prompt_tokens,
                "completion_tokens": response.usage.completion_tokens,
                "total_tokens": response.usage.total_tokens,
            },
            finish_reason=response.choices[0].finish_reason,
            raw_response=response,
        )

    async def chat_completion_stream(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 2048,
        top_p: float = 0.95,
        **kwargs,
    ) -> AsyncGenerator[StreamChunk, None]:
        client = await self._get_client()
        stream = await client.chat.completions.create(
            model=self._model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            top_p=top_p,
            stream=True,
            stream_options={"include_usage": True},
            **kwargs,
        )

        async for chunk in stream:
            if chunk.choices:
                choice = chunk.choices[0]
                if choice.delta and choice.delta.content:
                    yield StreamChunk(content=choice.delta.content)
                if choice.finish_reason:
                    yield StreamChunk(content="", finish_reason=choice.finish_reason)

            if chunk.usage:
                yield StreamChunk(
                    content="",
                    finish_reason=chunk.choices[0].finish_reason if chunk.choices else None,
                    usage={
                        "prompt_tokens": chunk.usage.prompt_tokens,
                        "completion_tokens": chunk.usage.completion_tokens,
                        "total_tokens": chunk.usage.total_tokens,
                    },
                )


class DeepSeekProvider(OpenAICompatibleProvider):
    """DeepSeek API Provider — 复用 OpenAI 兼容实现"""

    def __init__(self):
        super().__init__(
            api_key=DEEPSEEK_API_KEY,
            base_url=DEEPSEEK_BASE_URL,
            model=DEEPSEEK_MODEL,
            timeout=DEEPSEEK_TIMEOUT,
        )


class VolcengineProvider(OpenAICompatibleProvider):
    """火山引擎 CodePlan (Doubao-seed) Provider — 复用 OpenAI 兼容实现

    火山引擎方舟平台聚合了豆包、DeepSeek 等多模型，同一个 API Key
    可通过 model 参数切换调用不同模型。
    文档: https://www.volcengine.com/docs/6458/1134559
    """

    def __init__(self, model: str = None):
        super().__init__(
            api_key=VOLCENGINE_API_KEY,
            base_url=VOLCENGINE_BASE_URL or "https://ark.cn-beijing.volces.com/api/v3",
            model=model or VOLCENGINE_MODEL or "doubao-seed-2-0-pro-260215",
            timeout=VOLCENGINE_TIMEOUT,
        )


class LLMProviderFactory:
    """LLM Provider 工厂类"""

    _providers: Dict[str, BaseLLMProvider] = {}
    _current_provider: Optional[BaseLLMProvider] = None
    _lock = asyncio.Lock()

    @classmethod
    async def get_provider(cls, provider_name: Optional[str] = None,
                           model: Optional[str] = None) -> BaseLLMProvider:
        """
        获取 LLM Provider 实例

        Args:
            provider_name: 可选，指定 Provider 名称，默认使用配置
                          支持: deepseek, volcengine
            model: 可选，指定模型名（用于同 provider 多模型场景，
                   如火山引擎调 DeepSeek）

        Returns:
            LLM Provider 实例
        """
        name = provider_name or LLM_PROVIDER or "deepseek"
        # 缓存键：provider 名 + 模型名（同 provider 不同模型分别缓存）
        cache_key = f"{name}:{model}" if model else name

        async with cls._lock:
            if cache_key not in cls._providers:
                cls._providers[cache_key] = cls._create_provider(name, model)
                logger.info(f"✅ LLM Provider 已初始化: {cache_key}")

            return cls._providers[cache_key]

    @classmethod
    def _create_provider(cls, name: str, model: Optional[str] = None) -> BaseLLMProvider:
        """创建 Provider 实例"""
        name_lower = name.lower()
        if name_lower == "deepseek":
            return DeepSeekProvider()
        elif name_lower == "volcengine":
            return VolcengineProvider(model=model)
        else:
            raise ValueError(f"不支持的 LLM Provider: {name}，可选: deepseek, volcengine")

    @classmethod
    async def switch_provider(cls, provider_name: str) -> BaseLLMProvider:
        """
        切换当前使用的 Provider

        Args:
            provider_name: 新的 Provider 名称

        Returns:
            新的 Provider 实例
        """
        async with cls._lock:
            if provider_name not in cls._providers:
                cls._providers[provider_name] = cls._create_provider(provider_name)
            cls._current_provider = cls._providers[provider_name]
            logger.info(f"🔄 已切换 LLM Provider 至: {provider_name}")
            return cls._current_provider

    @classmethod
    def list_available_providers(cls) -> List[Dict[str, str]]:
        """列出所有可用的 Provider 及其配置状态"""
        providers_info = []

        # DeepSeek
        providers_info.append({
            "name": "deepseek",
            "display_name": "DeepSeek",
            "model": DEEPSEEK_MODEL,
            "configured": bool(DEEPSEEK_API_KEY),
            "status": "Available" if DEEPSEEK_API_KEY else "API Key not configured",
        })

        # 火山引擎
        providers_info.append({
            "name": "volcengine",
            "display_name": "Volcengine CodePlan",
            "model": VOLCENGINE_MODEL or "doubao-seed-2-0-pro-260215",
            "configured": bool(VOLCENGINE_API_KEY),
            "status": "Available" if VOLCENGINE_API_KEY else "API Key not configured",
        })

        return providers_info

    @classmethod
    async def get_current_provider(cls) -> BaseLLMProvider:
        """获取当前默认 Provider"""
        if cls._current_provider is None:
            cls._current_provider = await cls.get_provider()
        return cls._current_provider


# 便捷函数
async def get_llm_provider(provider_name: Optional[str] = None,
                           model: Optional[str] = None) -> BaseLLMProvider:
    """获取 LLM Provider"""
    return await LLMProviderFactory.get_provider(provider_name, model)


async def chat_with_llm(
    messages: List[Dict[str, str]],
    stream: bool = False,
    provider: Optional[str] = None,
    **kwargs,
):
    """
    便捷的 LLM 对话函数

    Args:
        messages: 对话消息列表
        stream: 是否流式
        provider: 指定 Provider，默认使用配置
        **kwargs: 其他参数 (temperature, max_tokens, top_p 等)
    """
    llm = await get_llm_provider(provider)

    if stream:
        return llm.chat_completion_stream(messages, **kwargs)
    else:
        return await llm.chat_completion(messages, **kwargs)


class ProviderMetrics:
    """Provider 性能指标收集"""

    def __init__(self):
        self._metrics: Dict[str, Dict] = {}
        self._lock = asyncio.Lock()

    async def record_call(self, provider: str, duration: float, tokens: int):
        """记录一次调用"""
        async with self._lock:
            if provider not in self._metrics:
                self._metrics[provider] = {
                    "total_calls": 0,
                    "total_tokens": 0,
                    "total_duration": 0,
                    "error_count": 0,
                }
            self._metrics[provider]["total_calls"] += 1
            self._metrics[provider]["total_tokens"] += tokens
            self._metrics[provider]["total_duration"] += duration

    async def record_error(self, provider: str):
        """记录一次错误（即使之前没有成功调用也会被记录）"""
        async with self._lock:
            if provider not in self._metrics:
                self._metrics[provider] = {
                    "total_calls": 0,
                    "total_tokens": 0,
                    "total_duration": 0,
                    "error_count": 0,
                }
            self._metrics[provider]["error_count"] += 1

    async def get_stats(self) -> Dict[str, Dict]:
        """获取统计信息"""
        async with self._lock:
            return dict(self._metrics)


# 全局指标实例
provider_metrics = ProviderMetrics()


# ═══════════════════════════════════════════════════════════════
# 模型配置信息
# ═══════════════════════════════════════════════════════════════

# DeepSeek 可用模型
DEEPSEEK_MODELS = [
    {
        "id": "deepseek-v4-flash",
        "name": "DeepSeek V4 Flash",
        "description": "快速响应模型，日常对话首选 ⚡",
        "max_tokens": 8192,
        "supports_streaming": True,
        "is_default": True,
        "provider": "deepseek",
    },
    {
        "id": "deepseek-v4-pro",
        "name": "DeepSeek V4 Pro",
        "description": "深度推理模型，复杂任务更精准 🎯",
        "max_tokens": 8192,
        "supports_streaming": True,
        "is_default": False,
        "provider": "deepseek",
    },
    {
        "id": "deepseek-chat",
        "name": "DeepSeek Chat",
        "description": "标准对话模型，平衡性能 🤖",
        "max_tokens": 4096,
        "supports_streaming": True,
        "is_default": False,
        "provider": "deepseek",
    },
]

# 火山引擎（豆包）可用模型
VOLCENGINE_MODELS = [
    {
        "id": "doubao-seed-2-0-pro-260215",
        "name": "豆包 Seed 2.0 Pro",
        "description": "字节跳动豆包系列最新模型，与 Claude Code 同版本 🥟",
        "max_tokens": 8192,
        "supports_streaming": True,
        "is_default": True,
        "provider": "volcengine",
    },
    {
        "id": "deepseek-v4-flash-volcengine",
        "name": "DeepSeek V4 Flash (火山引擎)",
        "description": "通过火山引擎方舟调用的 DeepSeek V4 Flash ⚡",
        "max_tokens": 8192,
        "supports_streaming": True,
        "is_default": False,
        "provider": "volcengine",
        "actual_model": "deepseek-v4-flash",  # 实际传给火山引擎的模型名
    },
]


def get_all_models_info() -> List[Dict]:
    """获取所有可用模型信息"""
    return DEEPSEEK_MODELS + VOLCENGINE_MODELS


def get_models_for_provider(provider_name: str) -> List[Dict]:
    """获取指定 Provider 的可用模型"""
    if provider_name.lower() == "volcengine":
        return VOLCENGINE_MODELS
    else:
        return DEEPSEEK_MODELS


def get_allowed_models_for_provider(provider_name: str) -> List[str]:
    """获取指定 Provider 允许的模型 ID 列表"""
    models = get_models_for_provider(provider_name)
    return [m["id"] for m in models]


def get_provider_for_model(model_id: str) -> str:
    """根据模型 ID 反查它属于哪个 Provider"""
    for m in get_all_models_info():
        if m["id"] == model_id:
            return m["provider"]
    return "deepseek"  # 找不到时默认 deepseek


def get_actual_model_name(model_id: str) -> Optional[str]:
    """查模型实际传给 API 的名字（火山引擎聚合模型场景用）。

    如 deepseek-v4-flash-volcengine 实际传 deepseek-v4-flash。
    普通模型没有 actual_model 字段，返回 None（用 provider 默认 model）。
    """
    for m in get_all_models_info():
        if m["id"] == model_id:
            return m.get("actual_model")
    return None


def get_default_model_for_provider(provider_name: str) -> str:
    """获取指定 Provider 的默认模型"""
    models = get_models_for_provider(provider_name)
    default_models = [m for m in models if m.get("is_default", False)]
    if default_models:
        return default_models[0]["id"]
    return models[0]["id"] if models else ""
