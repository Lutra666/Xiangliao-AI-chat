import { useEffect, useState, useCallback, useRef } from 'react';
import { useChatStore } from '../../../store/useChatStore';

/**
 * 草稿持久化 Hook —— 按 sessionId 缓存输入内容到 localStorage。
 * 切换会话时自动恢复目标会话草稿。
 *
 * 性能优化（解决长上下文下输入法卡顿）：
 *   - setInput 引用稳定：用 useRef 持有最新 input，使 useCallback 不依赖 input，
 *     避免下游依赖 setInput 的 useCallback（如 quickSend）随每次按键重建，
 *     进而让 React.memo(ChatMessageList) 真正生效。
 *   - localStorage 写入防抖 300ms：避免 IME composition 期间每次按键都触发同步 IO 阻塞主线程。
 */
export function useDraft(sessionId) {
  const draftKey = sessionId ? `draft_${sessionId}` : 'draft_new';
  const [input, setInputState] = useState(() => {
    try {
      return localStorage.getItem(draftKey) || '';
    } catch {
      return '';
    }
  });

  // 用 ref 持有最新 input，使 setInput 不必依赖 input 状态
  const inputRef = useRef(input);
  const previousKeyRef = useRef(draftKey);
  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  const saveTimerRef = useRef(null);
  const pendingRef = useRef(null);
  const flushDraft = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    const pending = pendingRef.current;
    if (!pending) return;
    try {
      if (pending.value) localStorage.setItem(pending.key, pending.value);
      else localStorage.removeItem(pending.key);
    } catch {}
    pendingRef.current = null;
  }, []);

  useEffect(() => {
    window.addEventListener('pagehide', flushDraft);
    return () => window.removeEventListener('pagehide', flushDraft);
  }, [flushDraft]);

  // 切换会话时恢复草稿
  useEffect(() => {
    try {
      // 新会话首次收到服务端 ID 时，将回复期间输入的草稿一起带过去。
      if (previousKeyRef.current === 'draft_new' && draftKey !== 'draft_new'
          && useChatStore.getState().newlyCreatedSessionId === sessionId && inputRef.current) {
        localStorage.setItem(draftKey, inputRef.current);
        localStorage.removeItem('draft_new');
      }
      const v = localStorage.getItem(draftKey) || '';
      setInputState(v);
      inputRef.current = v;
    } catch {
      setInputState('');
      inputRef.current = '';
    }
    previousKeyRef.current = draftKey;
    return flushDraft;
  }, [draftKey, sessionId, flushDraft]);

  // 输入变化时保存（setInput 引用稳定，仅依赖 draftKey）
  const setInput = useCallback((value) => {
    const v = typeof value === 'function' ? value(inputRef.current) : value;
    setInputState(v);
    inputRef.current = v;

    // 防抖写 localStorage，避免 IME 输入时同步阻塞主线程
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    pendingRef.current = { key: draftKey, value: v };
    saveTimerRef.current = setTimeout(flushDraft, 300);
  }, [draftKey, flushDraft]);

  return [input, setInput];
}
