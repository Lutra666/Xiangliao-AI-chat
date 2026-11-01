import { streamChat, friendlyError } from './api';

/**
 * 读取 SSE 流式响应，逐事件回调。
 *
 * 后端事件格式：
 *   data: {"type":"chunk","content":"..."}
 *   data: {"type":"timing",...}
 *   data: {"type":"usage",...}
 *   data: {"type":"done",...}
 *   data: {"type":"error","message":"..."}
 *
 * @param {string} prompt        喂给 LLM 的 prompt
 * @param {string|null} sessionId
 * @param {object} opts          { characterId, parameters, response_prompt, signal }
 * @param {object} handlers      { onChunk, onTiming, onUsage, onDone, onError }
 * @returns {Promise<{fullText:string, done:boolean}>}
 *
 * 说明：抽取出 ChatPage 中三处重复的 SSE 读取循环（普通消息/角色润色/AI代生成），
 * 统一 buffer 解析、错误与取消处理。调用方负责把 fullText 反映到 UI。
 */
export async function readChatStream(prompt, sessionId, opts, handlers) {
  const { onChunk, onTiming, onUsage, onDone, onError } = handlers || {};
  let fullText = '';
  let done = false;

  let response;
  try {
    response = await streamChat(prompt, sessionId, opts || {});
  } catch (e) {
    // fetch 网络层错误（DNS / 连接拒绝 / CORS 等）
    throw new Error(friendlyError(0, e?.message || 'network'));
  }

  // 检查 HTTP 状态码，非 2xx 时给出明确错误而非笼统的"服务不可用"
  if (!response.ok) {
    let raw = '';
    try {
      const errBody = await response.json();
      raw = typeof errBody?.detail === 'string' ? errBody.detail
        : errBody?.detail ? JSON.stringify(errBody.detail)
        : errBody?.message || '';
    } catch { /* 非 JSON 错误体，raw 留空由 friendlyError 兜底 */ }
    throw new Error(friendlyError(response.status, raw));
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('当前浏览器不支持流式响应，请升级或更换浏览器');

  const decoder = new TextDecoder();
  let buffer = '';
  let errored = false;

  while (true) {
    const { done: streamDone, value } = await reader.read();
    if (streamDone) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // 保留最后不完整的一行
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      let event;
      try {
        event = JSON.parse(line.slice(6));
      } catch {
        continue; // 跳过无法解析的行
      }
      switch (event.type) {
        case 'chunk':
          fullText += event.content || '';
          onChunk?.(event.content || '', fullText);
          break;
        case 'timing':
          onTiming?.(event);
          break;
        case 'usage':
          onUsage?.(event);
          break;
        case 'done':
          done = true;
          onDone?.(event);
          break;
        case 'error':
          errored = true;
          onError?.(event.message || '未知错误');
          break;
      }
      if (errored) break;
    }
    if (errored) break;
  }
  return { fullText, done };
}

/**
 * React Hook：封装一次流式对话，管 AbortController 与 loading 态。
 * 返回 { loading, run, abort }。run 完成后调用方在 onDone/onChunk 里更新 UI。
 */
export function useStreamChat() {
  // 简单实现：状态由调用方持有（ChatPage 已有 loading/abortRef）。
  // 这里只暴露纯函数 readChatStream，保持职责单一、避免与 ChatPage 状态冲突。
  return { readChatStream };
}
