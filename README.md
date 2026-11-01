# 享聊 Xiangliao AI Chat

AI 聊天应用，包含 FastAPI 后端、React Web 前端和 Electron 桌面端。

## 本地运行

1. 安装 Python 和 Node.js，在 `backend` 目录安装依赖：`pip install -r requirements.txt`。
2. 将 `backend/.env.example` 复制为 `backend/.env`，配置模型 API 密钥和 JWT 密钥。不要提交 `.env`。
3. 在 `frontend` 目录运行 `npm ci`，再运行 `npm run build`。
4. 在 `backend` 目录运行 `python -m uvicorn app.main:app --host 0.0.0.0 --port 8000`，访问 `http://127.0.0.1:8000`。

前端开发模式可在 `frontend` 目录运行 `npm run dev`；Electron 可运行 `npm run electron:dev`。使用局域网访问时，请自行检查网络和访问控制。

会话数据库、上传文件、日志和密钥均保存在本地，不应提交到仓库。
