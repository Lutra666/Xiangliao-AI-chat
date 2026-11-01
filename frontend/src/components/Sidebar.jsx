import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from './ui';
import { useAppStore } from '../store/useAppStore';
import { useSessions, useDeleteSession, useInheritSession } from '../hooks/useSessions';
import SessionList from '../features/sidebar/SessionList';
import CharacterList from '../features/sidebar/CharacterList';
import SidebarFooter from '../features/sidebar/SidebarFooter';

export default function Sidebar({ activeId, onSelect, onNew, onRefresh, onDeleteSession, activeCharId, onSelectChar }) {
  const user = useAppStore((s) => s.user);
  const { data: sessions = [] } = useSessions();
  const deleteSession = useDeleteSession();
  const inheritSession = useInheritSession();

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    try {
      await deleteSession.mutateAsync(id);
      if (activeId === id && onDeleteSession) onDeleteSession(id);
    } catch (e) {
      console.debug(e);
    }
  };

  return (
    <div className="w-64 bg-surface border-r border-border flex flex-col h-screen shrink-0 transition-colors duration-slower">
      {/* Logo */}
      <div className="p-5 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand to-rose-400 flex items-center justify-center text-brand-on shadow-md shadow-brand/20">
            <span className="text-xs font-bold">享</span>
          </div>
          <div>
            <h2 className="text-[15px] font-bold text-text-header tracking-tight">享聊</h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
              <p className="text-[10px] font-medium text-text-subtle uppercase tracking-wider">
                {user?.display_name || user?.username}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 新对话 */}
      <div className="px-4 pt-4">
        <Button variant="primary" className="w-full" onClick={onNew}>
          <Plus className="w-4 h-4" />
          开启新对话
        </Button>
      </div>

      {/* 角色栏 */}
      <CharacterList activeCharId={activeCharId} onSelectChar={onSelectChar} />

      {/* 历史会话 */}
      <SessionList
        sessions={sessions}
        activeId={activeId}
        onSelect={onSelect}
        onPin={() => {}}
        onInherit={(id) => inheritSession.mutateAsync(id)}
        onDelete={handleDelete}
      />

      {/* 底部 */}
      <SidebarFooter />
    </div>
  );
}
