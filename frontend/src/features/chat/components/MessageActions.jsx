import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { RotateCw, Copy, Pencil, Trash2, GitBranch, Undo2, X } from 'lucide-react';
import { formatTime } from '../utils/formatTime';

export default function MessageActions({
  content, createdAt, tokenCount, isUser, onRetry, onEdit, onDelete,
  onBranch, onRecall, onQuote, onBookmark, onContinue, bookmarked, canEdit, menuOpen, onClose,
}) {
  const firstActionRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    firstActionRef.current?.focus();
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menuOpen, onClose]);

  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(content || '');
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = content || '';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (!copied) { alert('复制失败，请手动选择内容'); return; }
    }
    onClose();
  };

  const action = (handler) => () => { onClose(); handler?.(); };
  const itemClass = 'flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm text-text transition-colors hover:bg-surface-hover active:bg-surface-active';

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mt-1.5 mx-1 text-[10px] text-text-subtle">
        {createdAt && <span>{formatTime(createdAt)}</span>}
        {tokenCount != null && <span>{tokenCount} tokens</span>}
        {!isUser && onRetry && (
          <button onClick={onRetry} title="重新生成" className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 hover:bg-brand-soft hover:text-brand transition-colors cursor-pointer">
            <RotateCw className="w-3 h-3" /> 重试
          </button>
        )}
      </div>
      {menuOpen && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-6 backdrop-blur-[3px]"
          onClick={onClose}>
          <div role="dialog" aria-modal="true" aria-label="消息操作" onClick={(event) => event.stopPropagation()}
            className="w-full max-w-xs rounded-[24px] bg-surface p-2 shadow-xl border border-border animate-in zoom-in-95">
            <div className="flex items-center justify-between px-4 py-2 text-sm font-semibold text-text-header">
              消息操作
              <button onClick={onClose} aria-label="关闭" className="p-1 text-text-muted"><X className="w-4 h-4" /></button>
            </div>
            <button ref={firstActionRef} onClick={copy} className={itemClass}><Copy className="w-4 h-4" />复制</button>
            {onQuote && <button onClick={action(onQuote)} className={itemClass}>↩ 引用回复</button>}
            {onBookmark && <button onClick={action(onBookmark)} className={itemClass}>☆ {bookmarked ? '编辑收藏' : '收藏 / 标记节点'}</button>}
            {onContinue && <button onClick={action(onContinue)} className={itemClass}>✦ 继续生成</button>}
            {canEdit && <button onClick={action(onEdit)} className={itemClass}><Pencil className="w-4 h-4" />编辑</button>}
            {onBranch && <button onClick={action(onBranch)} className={itemClass}><GitBranch className="w-4 h-4" />从这里开启分支</button>}
            {onRecall && <button onClick={action(onRecall)} className={itemClass}><Undo2 className="w-4 h-4" />撤回</button>}
            {onDelete && <button onClick={action(onDelete)} className={itemClass}><Trash2 className="w-4 h-4" />删除</button>}
          </div>
        </div>, document.body
      )}
    </>
  );
}
