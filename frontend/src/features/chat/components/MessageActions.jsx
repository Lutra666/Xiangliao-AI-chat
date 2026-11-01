import { useState } from 'react';
import { RotateCw, Copy, Check, Pencil, Trash2, Clock } from 'lucide-react';
import { formatTime } from '../utils/formatTime';

export default function MessageActions({
  content,
  createdAt,
  isUser,
  onRetry,
  onEdit,
  onDelete,
  canEdit,
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const text = content || '';
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => fallback(text));
    } else {
      fallback(text);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const fallback = (text) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch {}
    document.body.removeChild(ta);
  };

  return (
    <div className="flex items-center gap-0.5 mt-1.5 ml-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity duration-normal">
      {createdAt && (
        <span className="inline-flex items-center gap-0.5 text-[10px] text-text-subtle px-1">
          <Clock className="w-2.5 h-2.5" />
          {formatTime(createdAt)}
        </span>
      )}
      {!isUser && onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-0.5 text-[10px] px-2 py-0.5 text-text-subtle hover:text-brand hover:bg-brand-soft rounded-full transition cursor-pointer"
          title="重新生成"
        >
          <RotateCw className="w-2.5 h-2.5" />
          重试
        </button>
      )}
      <button
        onClick={handleCopy}
        className="inline-flex items-center gap-0.5 text-[10px] px-2 py-0.5 text-text-subtle hover:text-text hover:bg-surface-hover rounded-full transition cursor-pointer"
        title="复制选中文本"
      >
        {copied ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5" />}
        {copied ? '已复制' : '复制'}
      </button>
      {canEdit && (
        <button
          onClick={onEdit}
          className="inline-flex items-center gap-0.5 text-[10px] px-2 py-0.5 text-text-subtle hover:text-brand hover:bg-brand-soft rounded-full transition cursor-pointer"
          title="编辑后从这条重新对话"
        >
          <Pencil className="w-2.5 h-2.5" />
          编辑
        </button>
      )}
      {onDelete && (
        <button
          onClick={onDelete}
          className="inline-flex items-center gap-0.5 text-[10px] px-2 py-0.5 text-text-subtle hover:text-danger hover:bg-danger-soft rounded-full transition cursor-pointer"
        >
          <Trash2 className="w-2.5 h-2.5" />
          删除
        </button>
      )}
    </div>
  );
}
