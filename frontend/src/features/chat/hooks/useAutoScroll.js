import { useEffect, useRef, useState, useCallback } from 'react';

export function useAutoScroll() {
  const scrollContainerRef = useRef(null);
  const bottomRef = useRef(null);
  const autoScrollRef = useRef(true);
  const [showNewMsg, setShowNewMsg] = useState(false);

  useEffect(() => {
    const el = scrollContainerRef.current;
    const content = el?.firstElementChild;
    if (!el || !content) return;
    const onScroll = () => {
      const y = el.scrollTop;
      const atBottom = el.scrollHeight - y - el.clientHeight < 100;
      autoScrollRef.current = atBottom;
      if (atBottom) setShowNewMsg(false);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    let previousHeight = content.getBoundingClientRect().height;
    const observer = new ResizeObserver(() => {
      const height = content.getBoundingClientRect().height;
      if (height > previousHeight) {
        if (autoScrollRef.current) el.scrollTop = el.scrollHeight;
        else setShowNewMsg(true);
      }
      previousHeight = height;
    });
    observer.observe(content);
    return () => { observer.disconnect(); el.removeEventListener('scroll', onScroll); };
  }, []);

  const scrollToBottom = useCallback(() => {
    autoScrollRef.current = true;
    setShowNewMsg(false);
    const el = scrollContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  return { scrollContainerRef, bottomRef, showNewMsg, scrollToBottom };
}
