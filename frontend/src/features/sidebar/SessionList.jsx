import { useState, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import SessionItem from './SessionItem';
import { Input } from '../../components/ui';

export default function SessionList({ sessions, activeId, onSelect, onPin, onInherit, onDelete }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [pinnedIds, setPinnedIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('pinned_sessions') || '[]');
    } catch {
      return [];
    }
  });

  const filteredSessions = useMemo(
    () =>
      sessions.filter((s) =>
        !searchQuery || (s.title || '').toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [sessions, searchQuery]
  );

  const pinnedSessions = filteredSessions.filter((s) => pinnedIds.includes(s.id));
  const normalSessions = filteredSessions.filter((s) => !pinnedIds.includes(s.id));

  const togglePin = (e, id) => {
    e.stopPropagation();
    const newPinned = pinnedIds.includes(id)
      ? pinnedIds.filter((pid) => pid !== id)
      : [...pinnedIds, id];
    setPinnedIds(newPinned);
    localStorage.setItem('pinned_sessions', JSON.stringify(newPinned));
  };

  return (
    <div className="flex-1 overflow-y-auto chat-scroll px-3 py-2 space-y-1">
      <div className="flex items-center justify-between px-1 pb-2">
        <p className="text-[11px] font-bold text-text-subtle uppercase tracking-widest">
          历史会话
        </p>
      </div>

      {/* 搜索 */}
      <div className="relative mb-2">
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索会话..."
          size="sm"
          prefix={<Search className="w-3.5 h-3.5" />}
          className="bg-surface-hover border-0"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-text-subtle hover:text-text cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* 置顶 */}
      {pinnedSessions.length > 0 && (
        <>
          <p className="px-1 pt-1 pb-1 text-[10px] font-semibold text-warning uppercase tracking-wider">
            📌 置顶
          </p>
          {pinnedSessions.map((s) => (
            <SessionItem
              key={s.id}
              s={s}
              activeId={activeId}
              onSelect={onSelect}
              onPin={togglePin}
              onInherit={onInherit}
              onDelete={onDelete}
              isPinned={true}
            />
          ))}
        </>
      )}

      {/* 普通 */}
      {pinnedSessions.length > 0 && normalSessions.length > 0 && (
        <p className="px-1 pt-2 pb-1 text-[10px] font-semibold text-text-subtle uppercase tracking-wider">
          最近
        </p>
      )}
      {normalSessions.map((s) => (
        <SessionItem
          key={s.id}
          s={s}
          activeId={activeId}
          onSelect={onSelect}
          onPin={togglePin}
          onInherit={onInherit}
          onDelete={onDelete}
          isPinned={false}
        />
      ))}

      {filteredSessions.length === 0 && (
        <div className="text-center py-8 text-[12px] text-text-subtle">
          {searchQuery ? '未找到匹配的会话' : '暂无历史会话'}
        </div>
      )}
    </div>
  );
}
