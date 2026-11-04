import { useState, useRef, useCallback, useEffect, memo } from 'react';
import { ChevronRight, FileText } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { Avatar } from '../../../components/ui';
import MessageContent from './MessageContent';
import MessageActions from './MessageActions';

function ChatBubble({
  role,
  content,
  sources,
  tokenCount,
  userAvatar,
  aiAvatar,
  asRole,
  isDraft,
  isStreaming,
  createdAt,
  onRetry,
  onDelete,
  onEditSubmit,
  onBranch,
  onRecall,
  onQuote,
  onBookmark,
  onContinue,
  metadata,
  onSelectVersion,
  messageIndex,
}) {
  const [showSources, setShowSources] = useState(false);
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editText, setEditText] = useState('');
  const editTextareaRef = useRef(null);
  const holdRef = useRef(null);
  const pointerStartRef = useRef(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const cancelHold = useCallback(() => {
    clearTimeout(holdRef.current);
    holdRef.current = null;
    pointerStartRef.current = null;
  }, []);
  useEffect(() => cancelHold, [cancelHold]);

  const startHold = (event) => {
    if (editing || isStreaming || event.button !== 0 || event.target.closest('button, a, textarea, input')) return;
    cancelHold();
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    holdRef.current = setTimeout(() => { setMenuOpen(true); holdRef.current = null; }, 500);
  };
  const moveHold = (event) => {
    const start = pointerStartRef.current;
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) cancelHold();
  };

  const isUser = role === 'user' && !asRole;
  const isRoleMsg = !!asRole;
  const canEdit = isUser && !!onEditSubmit && !isStreaming;

  const startEdit = useCallback(() => {
    setEditText(content);
    setEditing(true);
    requestAnimationFrame(() => {
      const ta = editTextareaRef.current;
      if (!ta) return;
      ta.focus();
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 240) + 'px';
    });
  }, [content]);

  const submitEdit = () => {
    const v = editText.trim();
    if (!v) return;
    setEditing(false);
    onEditSubmit?.(messageIndex, editText);
  };

  return (
    <div className={cn('flex mb-5 message-in group', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'flex items-start gap-2.5 max-w-[85%] md:max-w-[75%]',
          isUser ? 'flex-row-reverse' : 'flex-row'
        )}
      >
        {/* 头像 */}
        <div className="shrink-0 mt-0.5">
          {isUser ? (
            userAvatar ? (
              <Avatar src={userAvatar} size="sm" className="ring-2 ring-brand/20 rounded-lg" />
            ) : (
              <Avatar emoji="👤" size="sm" gradient="brand" className="ring-2 ring-brand/20 rounded-lg" />
            )
          ) : (
            <Avatar
              emoji={aiAvatar || '🥰'}
              size="sm"
              gradient="gray"
              className="ring-2 ring-border rounded-lg"
            />
          )}
        </div>

        {/* 内容区 */}
        <div className={cn('flex flex-col', isUser ? 'items-end' : 'items-start')}>
          {/* 角色身份标签 */}
          {isRoleMsg && (
            <span className="text-[10px] text-brand font-semibold ml-1 mb-1">🎭 {asRole}</span>
          )}
          {isDraft && (
            <span className="text-[10px] text-text-subtle ml-1 mb-1">
              📝 你的原话（AI正在润色...）
            </span>
          )}

          {/* 气泡 */}
          <div
            onPointerDown={startHold}
            onPointerMove={moveHold}
            onPointerUp={cancelHold}
            onPointerCancel={cancelHold}
            onPointerLeave={cancelHold}
            onContextMenu={(event) => {
              if (editing || isStreaming || event.target.closest('button, a, textarea, input')) return;
              event.preventDefault();
              cancelHold();
              setMenuOpen(true);
            }}
            onKeyDown={(event) => {
              if (!editing && !isStreaming && (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) {
                event.preventDefault();
                setMenuOpen(true);
              }
            }}
            tabIndex={!editing && !isStreaming ? 0 : undefined}
            aria-label={!editing && !isStreaming ? '聊天消息，长按或使用上下文菜单打开操作' : undefined}
            style={{ WebkitTouchCallout: editing ? undefined : 'none' }}
            className={cn(
              'chat-message-surface px-4 py-3 rounded-[20px] text-[14.5px] leading-relaxed whitespace-pre-wrap break-words shadow-xs',
              isDraft
                ? 'bg-surface-hover text-text-subtle italic border border-dashed border-border-strong'
                : isUser
                  ? 'bg-text-header text-bg-elevated rounded-br-lg font-medium shadow-sm'
                  : isRoleMsg
                    ? 'bg-brand-soft border border-border-brand text-text rounded-bl-lg'
                    : 'bg-surface border border-border text-text rounded-bl-lg shadow-sm',
              editing && 'p-2'
            )}
          >
            {editing ? (
              <div className="flex flex-col gap-2 w-full min-w-[220px]">
                <textarea
                  ref={editTextareaRef}
                  className="w-full bg-bg text-text rounded-lg p-2 text-[13.5px] leading-relaxed border border-brand/30 focus:outline-none focus:ring-2 focus:ring-brand/20 resize-none"
                  rows={2}
                  value={editText}
                  onChange={(e) => {
                    setEditText(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 240) + 'px';
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                      e.preventDefault();
                      submitEdit();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setEditing(false);
                    }
                  }}
                />
                <div className="flex gap-1.5 justify-end items-center">
                  <span className="text-[10px] text-text-subtle mr-auto">
                    ↵ 发送 · ⇧↵ 换行 · Esc 取消
                  </span>
                  <button
                    onClick={() => setEditing(false)}
                    className="px-2.5 py-1 text-[11px] text-text-subtle hover:bg-surface-hover rounded-full cursor-pointer"
                  >
                    取消
                  </button>
                  <button
                    onClick={submitEdit}
                    className="px-2.5 py-1 text-[11px] bg-brand text-brand-on rounded-full hover:bg-brand-hover cursor-pointer"
                  >
                    发送
                  </button>
                </div>
              </div>
            ) : (
              <MessageContent content={content} isStreaming={isStreaming} />
            )}
          </div>

          {/* 操作菜单 */}
          {!editing && (
            <MessageActions
              content={content}
              createdAt={createdAt}
              tokenCount={tokenCount}
              isUser={isUser}
              onRetry={onRetry ? () => onRetry(messageIndex) : null}
              onEdit={canEdit ? startEdit : null}
              onDelete={onDelete}
              onBranch={onBranch}
              onRecall={onRecall}
              onQuote={onQuote}
              onBookmark={onBookmark}
              onContinue={onContinue}
              bookmarked={!!metadata?.bookmark}
              canEdit={canEdit}
              menuOpen={menuOpen}
              onClose={closeMenu}
            />
          )}

          {metadata?.versions?.length > 1 && <div className="mt-1 flex items-center gap-2 text-xs text-text-muted">
            <button disabled={(metadata.version_index ?? 0) === 0} onClick={() => onSelectVersion((metadata.version_index ?? 0) - 1)} aria-label="上一个版本">‹</button>
            <span>{(metadata.version_index ?? 0) + 1} / {metadata.versions.length}</span>
            <button disabled={(metadata.version_index ?? 0) >= metadata.versions.length - 1} onClick={() => onSelectVersion((metadata.version_index ?? 0) + 1)} aria-label="下一个版本">›</button>
          </div>}

          {/* 知识库溯源 */}
          {!isUser && sources && sources.length > 0 && (
            <div className="mt-2 w-full">
              <button
                onClick={() => setShowSources(!showSources)}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-brand bg-brand-soft hover:bg-brand-soft-hover border border-border-brand rounded-full transition cursor-pointer"
              >
                <ChevronRight
                  className={cn('w-3 h-3 transition-transform', showSources && 'rotate-90')}
                />
                AI 检索溯源 · {sources.length} 个引用
              </button>
              {showSources && (
                <div className="mt-2 space-y-1.5 animate-in fade-in">
                  {sources.map((s, i) => (
                    <div
                      key={i}
                      className="bg-surface-hover border border-border rounded-lg px-3 py-2 text-[12px] text-text-muted"
                    >
                      <span className="inline-flex items-center gap-1 font-semibold text-text">
                        <FileText className="w-3 h-3" />
                        {s.file_path || s.file_name}
                      </span>
                      {s.content_preview && (
                        <p className="line-clamp-2 mt-0.5 opacity-80">{s.content_preview}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(ChatBubble);
