import { Plus, Search, X, Pin, ArrowRightLeft, Trash2, Pencil } from 'lucide-react';
import { cn } from '../../lib/cn';
import { formatTime } from '../chat/utils/formatTime';

export default function SessionItem({ s, activeId, onSelect, onPin, onInherit, onDelete, isPinned }) {
  return (
    <div
      onClick={() => onSelect(s.id)}
      className={cn(
        'group flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-fast',
        activeId === s.id
          ? 'bg-brand-soft text-brand'
          : 'text-text-muted hover:bg-surface-hover'
      )}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          className={cn(
            'w-1.5 h-1.5 rounded-full shrink-0',
            activeId === s.id ? 'bg-brand' : 'bg-border-strong'
          )}
        />
        <div className="flex-1 min-w-0">
          <span
            className={cn(
              'text-[13px] truncate block',
              activeId === s.id ? 'font-semibold' : 'font-medium'
            )}
          >
            {s.title}
          </span>
          {s.total_tokens_used > 0 && (
            <span className="text-[9px] text-text-subtle">
              {(s.total_tokens_used / 1000).toFixed(0)}K tokens · ~¥
              {((s.total_tokens_used / 1_000_000) * 2).toFixed(2)}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={(e) => onPin(e, s.id)}
          className={cn(
            'p-1 rounded-md transition cursor-pointer',
            isPinned
              ? 'opacity-100 text-warning'
              : 'opacity-0 group-hover:opacity-100 hover:bg-warning-soft text-text-subtle hover:text-warning'
          )}
          title={isPinned ? '取消置顶' : '置顶'}
        >
          <Pin className="w-3.5 h-3.5" fill={isPinned ? 'currentColor' : 'none'} />
        </button>
        <button
          onClick={async (e) => {
            e.stopPropagation();
            try {
              const res = await onInherit(s.id);
              onSelect(res.new_session_id);
            } catch (err) {
              console.error(err);
            }
          }}
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-brand-soft text-text-subtle hover:text-brand rounded-md transition cursor-pointer"
          title="继承此对话"
        >
          <ArrowRightLeft className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => onDelete(e, s.id)}
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-danger-soft text-text-subtle hover:text-danger rounded-md transition cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
