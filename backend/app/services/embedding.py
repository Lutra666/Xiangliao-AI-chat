import logging
import threading
import openai
from ..config import (
    EMBEDDING_API_KEY,
    EMBEDDING_BASE_URL,
    EMBEDDING_MODEL,
    DEEPSEEK_API_KEY,
    DEEPSEEK_BASE_URL,
)

logger = logging.getLogger(__name__)

_client: openai.OpenAI | None = None
_lock = threading.Lock()


def _embedding_config_ok() -> bool:
    """
    校验 embedding 配置是否可用。

    常见陷阱：未单独配置 EMBEDDING_API_KEY 时，config 会复用 DeepSeek 的 key/base_url，
    但 DeepSeek 官方 API 不提供 BGE 等嵌入模型，会导致嵌入请求全部失败，
    长记忆与 RAG 静默降级（用户以为在用，其实没有）。
    """
    if not EMBEDDING_API_KEY or EMBEDDING_API_KEY in ("sk-placeholder",):
        logger.warning(
            "⚠ 未配置可用的 EMBEDDING_API_KEY，长记忆向量检索与 RAG 将降级为关键词匹配。"
            "请在 .env 中设置 EMBEDDING_API_KEY（推荐硅基流动）。"
        )
        return False
    # base_url 仍指向 DeepSeek 而模型名是 BGE → 几乎必然 404
    if EMBEDDING_BASE_URL.rstrip("/").endswith("deepseek.com"):
        logger.warning(
            "⚠ EMBEDDING_BASE_URL 指向 DeepSeek(%s)，但 DeepSeek 不提供嵌入模型 %s。"
            "请配置独立的 EMBEDDING_API_KEY / EMBEDDING_BASE_URL（如硅基流动）。",
            EMBEDDING_BASE_URL, EMBEDDING_MODEL,
        )
        return False
    return True


def get_client() -> openai.OpenAI:
    global _client
    if _client is None:
        with _lock:
            if _client is None:
                _client = openai.OpenAI(
                    api_key=EMBEDDING_API_KEY,
                    base_url=EMBEDDING_BASE_URL,
                )
    return _client


def embed(texts: list[str]) -> list[list[float]]:
    """将文本列表转为向量列表（调 Embedding API）"""
    if not texts:
        return []
    client = get_client()
    try:
        resp = client.embeddings.create(model=EMBEDDING_MODEL, input=texts)
    except Exception as e:
        # 明确抛出，避免被上层静默吞掉而误以为"记忆正常"
        logger.error("Embedding API 调用失败 (model=%s, base_url=%s): %s",
                     EMBEDDING_MODEL, EMBEDDING_BASE_URL, e)
        raise
    resp.data.sort(key=lambda x: x.index)
    return [d.embedding for d in resp.data]


def embed_query(text: str) -> list[float]:
    """单条查询文本向量化"""
    return embed([text])[0]


# 模块加载时校验一次，启动日志中可见
_embedding_config_ok()
