import { forwardRef, memo } from 'react';
import ChatBubble from './ChatBubble';
import ChatEmptyState from './ChatEmptyState';
import WaitingIndicator from './WaitingIndicator';
import StreamingCursor from './StreamingCursor';
import NewMessageToast from './NewMessageToast';
import { useChatStore } from '../../../store/useChatStore';
import { useAppStore } from '../../../store/useAppStore';

/**
 * 消息列表组件
 *
 * 性能优化：用 React.memo 包装，使父组件（ChatPage）因 input 状态变化重渲染时
 * 不再连带重渲染整个消息列表（避免长对话下渲染所有 bubble + Markdown 解析阻塞主线程，
 * 导致中文输入法卡顿）。配合 useDraft 中 setInput 引用稳定，确保传入的 props 稳定。
 */
const ChatMessageList = memo(forwardRef(function ChatMessageList(
  { scrollContainerRef, bottomRef, onRetry, onEditSubmit, onQuickSend, onBranch, onRecall, onQuote, onBookmark, onContinue, onSelectVersion, showNewMsg, onScrollToBottom },
  _ref
) {
  const messages = useChatStore((s) => s.messages);
  const character = useChatStore((s) => s.character);
  const loading = useChatStore((s) => s.loading);
  const user = useAppStore((s) => s.user);
  const userAvatar = user?.avatar_url || '';
  const aiAvatar = character?.avatar_url || '🥰';

  return (
    <div
      ref={scrollContainerRef}
      className="flex-1 min-h-0 overflow-y-auto overscroll-contain chat-scroll px-4 md:px-8 pt-6 pb-6"
    >
      <div className="max-w-3xl mx-auto">
        {messages.length === 0 ? (
          <ChatEmptyState onQuickSend={onQuickSend} />
        ) : (
          <div>
            {messages.map((m, idx) => m.recalled ? (
              <div key={m.id} className="my-4 text-center text-xs text-text-subtle" role="status">
                {m.role === 'user' ? '你' : 'AI'}撤回了一条消息
              </div>
            ) : (
              <div key={m.id} id={`message-${m.id}`}>
              {m.metadata?.quote_id && (() => {
                const quoted = messages.find((item) => item.id === m.metadata.quote_id);
                return <button className="mb-1 ml-10 max-w-[75%] truncate rounded-lg border-l-2 border-brand bg-brand-soft px-3 py-1 text-xs text-text-muted" onClick={() => document.getElementById(`message-${m.metadata.quote_id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
                  引用：{quoted && !quoted.recalled ? quoted.content : '消息已撤回或不可用'}
                </button>;
              })()}
              <ChatBubble
                role={m.role}
                content={m.content}
                sources={m.sources}
                tokenCount={m.tokenCount ?? m.token_count}
                userAvatar={userAvatar}
                aiAvatar={aiAvatar}
                asRole={m.asRole}
                isDraft={m.isDraft}
                isStreaming={m.streaming}
                createdAt={m.created_at}
                messageIndex={idx}
                onRetry={m.role === 'assistant' ? onRetry : null}
                onEditSubmit={m.role === 'user' && !m.streaming ? onEditSubmit : null}
                onBranch={typeof m.id === 'number' && !m.streaming && !loading ? () => onBranch(m.id) : null}
                onRecall={typeof m.id === 'number' && !m.streaming && !loading ? () => onRecall(m.id) : null}
                onQuote={typeof m.id === 'number' && !m.streaming && !loading ? () => onQuote(m) : null}
                onBookmark={typeof m.id === 'number' && !m.streaming && !loading ? () => onBookmark(m) : null}
                onContinue={typeof m.id === 'number' && m.role === 'assistant' && !m.streaming && !loading ? () => onContinue(m.id) : null}
                metadata={m.metadata}
                onSelectVersion={(index) => onSelectVersion(m.id, index)}
              />
              </div>
            ))}
          </div>
        )}

        <WaitingIndicator />
        <StreamingCursor />
        <div ref={bottomRef} className="h-4" />

        <NewMessageToast show={showNewMsg} onClick={onScrollToBottom} />
      </div>
    </div>
  );
}));

export default ChatMessageList;
