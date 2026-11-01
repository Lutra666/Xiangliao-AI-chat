import {
  forwardRef,
  useRef,
  useEffect,
  useState,
  useCallback,
  useImperativeHandle,
  memo,
} from 'react';
import { Smile, ArrowRight, Square } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { IconButton } from '../../../components/ui';
import EmojiPicker from '../../../components/EmojiPicker';
import RolePlayBar from './RolePlayBar';
import { useChatStore } from '../../../store/useChatStore';
import { useDraft } from '../hooks/useDraft';

/**
 * 性能优化（解决长上下文下输入法卡顿）：
 *   - input 状态完全下沉到本组件内部（useDraft），父组件 ChatPage 不再因 input 变化而重渲染，
 *     从源头消除每次按键触发整树协调的开销。
 *   - 父组件通过 ref 命令式 API（insertPrefix / quickSend / focus）操作本组件，
 *     不再通过 setInput props 间接控制。
 *   - textarea 自适应高度用 requestAnimationFrame 防抖，避免每次按键同步 reflow。
 *   - 用 memo 包装，确保父组件因其他状态变化重渲染时不会连带本组件重渲染。
 */
const ChatInputBar = forwardRef(function ChatInputBar(
  { sessionId, onSend, onAbort, onInsertPrefix, onAutoGenerate },
  ref
) {
  const [input, setInput] = useDraft(sessionId);
  const [showEmoji, setShowEmoji] = useState(false);
  const textareaRef = useRef(null);
  const resizeRafRef = useRef(null);

  const loading = useChatStore((s) => s.loading);
  const character = useChatStore((s) => s.character);
  const setRolePrefix = useChatStore((s) => s.setRolePrefix);

  // 暴露命令式 API 给父组件
  useImperativeHandle(
    ref,
    () => ({
      insertPrefix: (prefix) => {
        setInput((prev) => prefix + prev.replace(/^\/[^\n:]*: /, ''));
      },
      quickSend: (text) => {
        setInput('');
        onSend(text);
      },
      focus: () => textareaRef.current?.focus(),
    }),
    [setInput, onSend]
  );

  // textarea 自适应高度 —— rAF 防抖，避免每次按键同步读取 scrollHeight 强制回流
  useEffect(() => {
    if (resizeRafRef.current) cancelAnimationFrame(resizeRafRef.current);
    resizeRafRef.current = requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 200) + 'px';
    });
    return () => {
      if (resizeRafRef.current) cancelAnimationFrame(resizeRafRef.current);
    };
  }, [input]);

  const handleEmoji = useCallback(
    (emoji) => {
      setInput((prev) => prev + emoji);
      setShowEmoji(false);
      textareaRef.current?.focus();
    },
    [setInput]
  );

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || loading) return;
    setRolePrefix('');
    setInput('');
    onSend(text);
  }, [input, loading, setRolePrefix, setInput, onSend]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleChange = useCallback(
    (e) => {
      setInput(e.target.value);
    },
    [setInput]
  );

  return (
    <div className="px-3 md:px-5 pb-3 md:pb-5 shrink-0">
      {/* 浮动输入卡片 */}
      <div className="max-w-3xl mx-auto">
        <RolePlayBar onInsertPrefix={onInsertPrefix} onAutoGenerate={onAutoGenerate} />

        <div className="relative group">
          {/* 柔光效果 —— 仅 focus 时显示，blur 已移除以避免长页面下 GPU 重绘开销 */}
          <div
            className="absolute -inset-0.5 bg-gradient-to-r from-brand/5 via-rose-300/10 to-brand/5
              rounded-2xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-slow pointer-events-none"
          />

          <div
            className="relative bg-surface border border-border rounded-2xl shadow-md
              group-focus-within:border-border-brand group-focus-within:shadow-lg
              transition-all duration-normal"
          >
            <textarea
              ref={textareaRef}
              rows={1}
              aria-label="输入消息"
              value={input}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder={
                loading
                  ? 'AI 正在回复中，你可以先输入下一条...'
                  : `和 ${character?.name || '享聊'} 聊点什么吧...`
              }
              className="relative w-full bg-transparent border-0 rounded-2xl pl-4 pr-14 py-3.5
                text-[14px] leading-relaxed text-text placeholder:text-text-subtle
                focus:outline-none resize-none"
            />

            <div className="absolute right-2 top-2 flex items-center gap-0.5">
              <IconButton
                label="表情"
                variant="ghost"
                size="iconSm"
                onClick={() => setShowEmoji(!showEmoji)}
              >
                <Smile className="w-5 h-5" />
              </IconButton>
              {showEmoji && <EmojiPicker onSelect={handleEmoji} onClose={() => setShowEmoji(false)} />}

              {loading ? (
                <IconButton label="停止生成" size="iconSm" variant="ghost" onClick={onAbort}>
                  <Square className="w-4 h-4" />
                </IconButton>
              ) : <IconButton
                label="发送"
                size="iconSm"
                variant={input.trim() && !loading ? 'primary' : 'ghost'}
                disabled={!input.trim() || loading}
                onClick={handleSend}
                className={cn(
                  input.trim() &&
                    !loading &&
                    'bg-gradient-to-br from-brand to-rose-400 hover:shadow-glow hover:scale-105 active:scale-95'
                )}
              >
                <ArrowRight className="w-4 h-4" />
              </IconButton>}
            </div>
          </div>
        </div>

        <p className="text-center text-[10px] text-text-subtle mt-2.5 select-none">
          Enter 发送 · Shift + Enter 换行 · AI 生成内容仅供参考
        </p>
      </div>
    </div>
  );
});

export default memo(ChatInputBar);