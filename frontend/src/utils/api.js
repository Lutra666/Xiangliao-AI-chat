// 服务器地址管理：真相源在 useAppStore（Zustand 持久化），
// 这里保留兼容导出，内部代理到 store，消除模块级 _serverUrl 变量。
import { useAppStore, getServerUrl as storeGetServerUrl } from '../store/useAppStore';

// 兼容旧调用：首次访问时把 localStorage / Electron 的值同步进 store
export async function initServerUrl() {
  const current = useAppStore.getState().serverUrl;
  if (current) {
    // 同步 Electron 最新值（Electron 端可能被用户在系统设置改过）
    if (window.electronAPI?.getServerUrl) {
      try {
        const url = await window.electronAPI.getServerUrl();
        if (url && url.replace(/\/+$/, '') !== current) {
          useAppStore.getState().setServerUrl(url);
        }
      } catch { /* 忽略 Electron 通信错误 */ }
    }
    return current;
  }
  // store 未初始化（冷启动 race），手动从 localStorage/Electron 兜底
  let url = null;
  if (window.electronAPI?.getServerUrl) {
    try { url = await window.electronAPI.getServerUrl(); } catch {}
  }
  if (!url) url = localStorage.getItem('server_url') || window.location.origin;
  useAppStore.getState().setServerUrl(url);
  return useAppStore.getState().serverUrl;
}

export function getServerUrl() {
  return storeGetServerUrl();
}

export function setServerUrl(url) {
  useAppStore.getState().setServerUrl(url);
}

function getApiBase() {
  return storeGetServerUrl() + '/api';
}

// ══ 友好错误文案映射 ══
// 将后端技术错误 / HTTP 状态码转换为用户可理解的提示，避免直接透传 "LLM provider timeout" 等
// 优先级：关键词匹配 > 状态码映射 > 原始消息 > 兜底
const FRIENDLY_ERROR_MAP = {
  400: '请求格式有误，请检查输入',
  401: '登录已过期，请重新登录',
  403: '暂无权限执行此操作',
  404: '资源不存在，可能已被删除',
  422: '消息内容有误（可能过长或格式错误）',
  429: '请求过于频繁，请稍后再试',
  500: '服务器开小差了，请稍后再试',
  502: '网关错误，请稍后再试',
  503: 'AI 服务暂时不可用，请稍后再试',
  504: '请求超时，请检查网络后重试',
};

// 关键词匹配（针对 LLM / 网络类错误，更精准）
const FRIENDLY_KEYWORD_MAP = [
  { kw: /timeout|超时/i, msg: '请求超时了，请检查网络或稍后重试' },
  { kw: /rate\s*limit|限流|频率/i, msg: '请求过于频繁，请稍后再试' },
  { kw: /network|ECONN|fetch failed|ERR_NETWORK/i, msg: '网络连接异常，请检查网络后重试' },
  { kw: /insufficient.*quota|余额不足|额度/i, msg: 'AI 服务额度不足，请联系管理员' },
  { kw: /model.*not.*found|模型不存在|model_not_found/i, msg: '当前 AI 模型不可用，请尝试切换模型' },
  { kw: /context.*length|上下文.*长|context_length_exceeded/i, msg: '对话历史过长，请新建会话或精简内容' },
  { kw: /connection|reset|broken\s*pipe/i, msg: '连接已断开，请重试' },
];

export function friendlyError(status, rawMsg = '') {
  // 1. 关键词优先（精准识别 LLM 类错误）
  for (const { kw, msg } of FRIENDLY_KEYWORD_MAP) {
    if (kw.test(rawMsg)) return msg;
  }
  // 2. 状态码映射
  if (FRIENDLY_ERROR_MAP[status]) return FRIENDLY_ERROR_MAP[status];
  // 3. 原始消息兜底
  return rawMsg || (status ? `请求失败 (${status})` : '请求失败，请重试');
}

async function request(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${getApiBase()}${path}`, { ...options, headers });
  } catch (e) {
    // 网络层错误：DNS 解析失败、连接拒绝、CORS 等
    throw new Error(friendlyError(0, e?.message || 'network'));
  }

  if (res.status === 401 && path !== '/auth/login') {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    // 跳转登录页（App.jsx 使用 HashRouter，用 hash 方式导航）
    window.location.hash = '#/login';
    throw new Error(friendlyError(401));
  }
  return res;
}

function _errMsg(res, data) {
  let raw = '';
  if (typeof data?.detail === 'string') raw = data.detail;
  else if (typeof data?.detail === 'object') raw = JSON.stringify(data.detail);
  else if (data?.message) raw = data.message;
  return friendlyError(res.status, raw);
}

async function readJsonSafely(res) {
  try {
    return await res.json();
  } catch (error) {
    console.debug('Failed to parse JSON response', error);
    return {};
  }
}

export async function login(username, password) {
  const res = await request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const data = await readJsonSafely(res);
    if (res.status === 401) throw new Error('用户名或密码错误');
    throw new Error(_errMsg(res, data));
  }
  const data = await res.json();
  if (data.token) localStorage.setItem('token', data.token);
  if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
  return data;
}

export async function register(form) {
  const res = await request('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(form),
  });
  if (!res.ok) {
    const data = await readJsonSafely(res);
    throw new Error(_errMsg(res, data));
  }
  const data = await res.json();
  if (data.token) localStorage.setItem('token', data.token);
  if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
  return data;
}

export async function sendMessage(question, sessionId, opts = {}) {
  const res = await request('/chat/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question,
      session_id: sessionId,
      character_id: opts.characterId || null,
      parameters: opts.parameters || null,
      response_prompt: opts.response_prompt || null,
    }),
  });
  if (!res.ok) {
    const data = await readJsonSafely(res);
    throw new Error(_errMsg(res, data));
  }
  return res.json();
}

// ══ SSE 流式聊天 ══
// 服务端无响应兜底超时（毫秒）。流式开始后由调用方控制取消，
// 此超时主要用于"首字节迟迟不来 / 网络中断未抛错"的兜底，避免无限转圈。
const STREAM_FALLBACK_TIMEOUT = 90_000;

export function streamChat(question, sessionId, opts = {}) {
  const token = localStorage.getItem('token');
  const url = `${getApiBase()}/chat/stream`;

  // 组合外部 signal（主动取消）与超时 signal（兜底）
  const signals = [];
  if (opts.signal) signals.push(opts.signal);
  let timeoutId = null;
  let timeoutController = null;
  if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
    signals.push(AbortSignal.timeout(STREAM_FALLBACK_TIMEOUT));
  } else {
    // 兼容旧环境：手动超时
    timeoutController = new AbortController();
    timeoutId = setTimeout(() => timeoutController.abort(), STREAM_FALLBACK_TIMEOUT);
    signals.push(timeoutController.signal);
  }
  // 合并多个 signal：任一 abort 即中断
  const controller = new AbortController();
  const onAbort = () => controller.abort(opts.signal?.reason);
  signals.forEach(s => {
    if (s.aborted) onAbort();
    else s.addEventListener('abort', onAbort, { once: true });
  });

  const promise = fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    signal: controller.signal,
    body: JSON.stringify({
      question,
      session_id: sessionId,
      character_id: opts.characterId || null,
      parameters: opts.parameters || null,
      response_prompt: opts.response_prompt || null,
    }),
  });

  // 请求结束后清理超时定时器
  if (timeoutId) promise.finally(() => clearTimeout(timeoutId));
  return promise;
}

export async function getSessions() {
  const res = await request('/chat/sessions');
  if (!res.ok) {
    console.warn(`[api] getSessions 失败 (${res.status})，返回空列表`);
    return [];
  }
  return res.json();
}

export async function getHistory(sessionId) {
  const res = await request(`/chat/history?session_id=${sessionId}`);
  if (!res.ok) {
    console.warn(`[api] getHistory 失败 (${res.status})，session=${sessionId}`);
    return { messages: [] };
  }
  return res.json();
}

export async function deleteSession(sessionId) {
  const res = await request(`/chat/session/${sessionId}`, { method: 'DELETE' });
  return res.json();
}

export async function recallMessage(messageId) {
  const res = await request(`/chat/message/${messageId}/recall`, { method: 'POST' });
  if (!res.ok) { const data = await readJsonSafely(res); throw new Error(_errMsg(res, data)); }
  return res.json();
}

export async function inheritSession(sessionId, messageId = null) {
  const suffix = messageId == null ? '' : `?through_message_id=${encodeURIComponent(messageId)}`;
  const res = await request(`/chat/inherit/${sessionId}${suffix}`, { method: 'POST' });
  if (!res.ok) { const d = await readJsonSafely(res); throw new Error(_errMsg(res, d)); }
  return res.json();
}

export async function getMe() {
  const res = await request('/auth/me');
  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
    const d = await readJsonSafely(res);
    throw new Error(_errMsg(res, d));
  }
  return res.json();
}

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}');
  } catch {
    return {};
  }
}

// ═══════════════════════════════════════════════
// 角色 API
// ═══════════════════════════════════════════════

export async function listCharacters(includeBuiltin = true) {
  const res = await request(`/characters?include_builtin=${includeBuiltin}`);
  if (!res.ok) {
    console.warn(`[api] listCharacters 失败 (${res.status})`);
    return [];
  }
  return res.json();
}

export async function createCharacter(data) {
  const res = await request('/characters', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) { const d = await readJsonSafely(res); throw new Error(_errMsg(res, d)); }
  return res.json();
}

export async function updateCharacter(id, data) {
  const res = await request(`/characters/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) { const d = await readJsonSafely(res); throw new Error(_errMsg(res, d)); }
  return res.json();
}

export async function deleteCharacter(id) {
  const res = await request(`/characters/${id}`, { method: 'DELETE' });
  return res.json();
}

export async function setDefaultCharacter(id) {
  const res = await request(`/characters/${id}/set-default`, { method: 'POST' });
  return res.json();
}

// ═══════════════════════════════════════════════
// 设置 API
// ═══════════════════════════════════════════════

export async function getSettings() {
  const res = await request('/settings');
  if (!res.ok) {
    console.warn(`[api] getSettings 失败 (${res.status})，返回默认设置`);
    return {};
  }
  return res.json();
}

export async function updateSettings(data) {
  const res = await request('/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) { const d = await readJsonSafely(res); throw new Error(_errMsg(res, d)); }
  return res.json();
}

export async function listModels() {
  const res = await request('/settings/models');
  return res.json();
}

// ═══════════════════════════════════════════════
// 记忆 API
// ═══════════════════════════════════════════════

export async function listMemories(sessionId, category = null) {
  const params = new URLSearchParams({ session_id: sessionId });
  if (category) params.set('category', category);
  const res = await request(`/memory/list?${params}`);
  if (!res.ok) throw new Error('加载会话记忆失败');
  return res.json();
}

export async function createMemory(sessionId, content, category = 'fact') {
  const res = await request('/memory', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, content, category }),
  });
  if (!res.ok) { const data = await readJsonSafely(res); throw new Error(_errMsg(res, data)); }
  return res.json();
}

export async function deleteMemory(id) {
  const res = await request(`/memory/${id}`, { method: 'DELETE' });
  return res.json();
}

export async function updateMemory(id, data) {
  const res = await request(`/memory/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function consolidateMemories(sessionId) {
  const res = await request(`/memory/consolidate?session_id=${encodeURIComponent(sessionId)}`, { method: 'POST' });
  if (!res.ok) throw new Error('整理会话记忆失败');
  return res.json();
}

// ═══════════════════════════════════════════════
// LLM Provider 管理 API
// ═══════════════════════════════════════════════

/**
 * 获取所有可用的 LLM Provider 列表
 */
export async function getLLMProviders() {
  const res = await request('/chat/providers');
  return res.json();
}

/**
 * 切换当前使用的 LLM Provider
 * @param {string} provider - Provider 名称: 'deepseek' / 'volcengine'
 */
export async function switchLLMProvider(provider) {
  const res = await request('/chat/providers/switch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider }),
  });
  return res.json();
}

/**
 * 获取 LLM 调用指标统计
 */
export async function getLLMMetrics() {
  const res = await request('/chat/providers/metrics');
  return res.json();
}
