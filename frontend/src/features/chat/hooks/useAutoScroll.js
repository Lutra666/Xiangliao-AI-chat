import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * 智能滚动 Hook —— 从 ChatPage 抽出。
 *
 * 行为：
 *   - 用户上滑时暂停自动滚动
 *   - 滑到底部附近时恢复
 *   - 有新消息但用户在上方时返回 showNewMsg=true
 *   - 提供 scrollToBottom() 立即滚到底
 *   - 监听滚动方向驱动 headerVisible（上滑显示、下滑隐藏）
 */
export function useAutoScroll(deps = []) {
  const scrollContainerRef = useRef(null);
  const bottomRef = useRef(null);
  const autoScrollRef = useRef(true);
  const lastScrollY = useRef(0);
  const [showNewMsg, setShowNewMsg] = useState(false);
  const [headerVisible, setHeaderVisible] = useState(true);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const onScroll = () => {
      const y = el.scrollTop;
      const dy = y - lastScrollY.current;
      if (Math.abs(dy) > 10) setHeaderVisible(dy < 0);
      lastScrollY.current = y;
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
      autoScrollRef.current = atBottom;
      if (atBottom) setShowNewMsg(false);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // 依赖变化（消息/流式内容）时滚动
  useEffect(() => {
    if (autoScrollRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else {
      // 通过回调让调用方决定是否显示提示
      // 这里用 ref 标记，具体 showNewMsg 由调用方在消息数变化时设置
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const scrollToBottom = useCallback(() => {
    autoScrollRef.current = true;
    setShowNewMsg(false);
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const pauseAuto = useCallback(() => {
    autoScrollRef.current = false;
  }, []);

  return {
    scrollContainerRef,
    bottomRef,
    autoScrollRef,
    showNewMsg,
    setShowNewMsg,
    headerVisible,
    scrollToBottom,
    pauseAuto,
  };
}
