import os
from pathlib import Path
from dotenv import load_dotenv
from .pack_config import get_data_dir, get_upload_dir, get_env_path, get_model_cache_dir

# 加载 .env（开发模式从 backend/ 加载，打包模式从 APPDATA 加载）
_env_path = get_env_path()
if _env_path.exists():
    load_dotenv(_env_path, override=True)

# ── 运行环境 ──
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
DEBUG = ENVIRONMENT == "development"

# ── DeepSeek ──
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash")
DEEPSEEK_TIMEOUT = int(os.getenv("DEEPSEEK_TIMEOUT", "60"))

# ── 火山引擎 CodePlan (Doubao-seed) ──
# 文档: https://www.volcengine.com/docs/6458/1134559
# 控制台: https://console.volcengine.com/ark/
VOLCENGINE_API_KEY = os.getenv("VOLCENGINE_API_KEY", "")
VOLCENGINE_BASE_URL = os.getenv("VOLCENGINE_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3")
VOLCENGINE_MODEL = os.getenv("VOLCENGINE_MODEL", "doubao-seed-2-0-pro-260215")
VOLCENGINE_TIMEOUT = int(os.getenv("VOLCENGINE_TIMEOUT", "60"))

# ── LLM Provider 全局配置 ──
# 可选值: deepseek, volcengine
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "deepseek")

# ── 嵌入模型（API 方式） ──
# 推荐使用硅基流动（SiliconFlow）：https://siliconflow.cn → 注册后获取 API Key
# 免费额度 2000万 tokens，BGE 模型 ¥0.5/百万 tokens
_EMBEDDING_KEY = os.getenv("EMBEDDING_API_KEY", "")
EMBEDDING_API_KEY = _EMBEDDING_KEY if _EMBEDDING_KEY else DEEPSEEK_API_KEY
EMBEDDING_BASE_URL = os.getenv("EMBEDDING_BASE_URL", "https://api.siliconflow.cn/v1")
# 如果没有独立的 embedding key，则复用 DeepSeek 的 key 和 base_url
if not _EMBEDDING_KEY:
    EMBEDDING_BASE_URL = DEEPSEEK_BASE_URL
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "BAAI/bge-large-zh-v1.5")
EMBEDDING_DIM = int(os.getenv("EMBEDDING_DIM", "1024"))

# ── JWT ──
JWT_SECRET = os.getenv("JWT_SECRET", "")
JWT_EXPIRES_HOURS = int(os.getenv("JWT_EXPIRES_HOURS", "72"))

# ── 数据库 ──
# 如果 DATABASE_URL 为空，默认使用 SQLite（开发/测试用，无需安装 MySQL）
_DEFAULT_DB = f"sqlite:///{get_data_dir() / 'deepchat.db'}"
DATABASE_URL = os.getenv("DATABASE_URL", "") or _DEFAULT_DB
DB_POOL_SIZE = int(os.getenv("DB_POOL_SIZE", "10"))
DB_MAX_OVERFLOW = int(os.getenv("DB_MAX_OVERFLOW", "20"))
DB_POOL_RECYCLE = int(os.getenv("DB_POOL_RECYCLE", "3600"))

# ── 数据存储 ──
_DATA_DIR = get_data_dir()

# ── CORS ──
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",") if o.strip()]

# ── 日志 ──
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
LOG_FILE = os.getenv("LOG_FILE")  # 如: "data/logs/app.log"
LOG_JSON_FORMAT = os.getenv("LOG_JSON_FORMAT", "false").lower() == "true"

# ── 限流 ──
RATE_LIMIT_ENABLED = os.getenv("RATE_LIMIT_ENABLED", "false").lower() == "true"
RATE_LIMIT_REQUESTS_PER_MINUTE = int(os.getenv("RATE_LIMIT_REQUESTS_PER_MINUTE", "60"))
