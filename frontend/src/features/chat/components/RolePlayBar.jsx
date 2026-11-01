import { useState, useRef } from 'react';
import { Pencil } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { useChatStore } from '../../../store/useChatStore';
import { useAppStore } from '../../../store/useAppStore';

export default function RolePlayBar({ onInsertPrefix, onAutoGenerate }) {
  const [showEditPanel, setShowEditPanel] = useState(false);
  const [editPrompt, setEditPrompt] = useState(
    () => localStorage.getItem('quick_response_prompt') || ''
  );
  const roleClickTimers = useRef({});

  const character = useChatStore((s) => s.character);
  const rolePrefix = useChatStore((s) => s.rolePrefix);
  const setRolePrefix = useChatStore((s) => s.setRolePrefix);
  const setCustomResponsePrompt = useChatStore((s) => s.setCustomResponsePrompt);
  const user = useAppStore((s) => s.user);

  const roleNames = {
    ai: character?.name || 'AI',
    user: user?.display_name || '我',
    narrator: '旁白',
  };

  // 单击/双击检测：单击插入前缀，双击 AI 代写
  const handleClick = (role) => (e) => {
    const now = Date.now();
    const prev = roleClickTimers.current[role] || 0;
    if (now - prev < 350) {
      roleClickTimers.current[role] = 0;
      setRolePrefix('');
      onAutoGenerate?.(role, e);
    } else {
      roleClickTimers.current[role] = now;
      onInsertPrefix?.(role, e);
      setTimeout(() => {
        roleClickTimers.current[role] = 0;
      }, 400);
    }
  };

  const labels = {
    ai: `${character?.avatar_url || '🥰'} ${roleNames.ai}`,
    user: `👤 ${roleNames.user}`,
    narrator: '📖 旁白',
  };

  return (
    <div className="mb-2">
      <div className="flex items-center gap-1.5 ml-1 flex-wrap">
        {['ai', 'user', 'narrator'].map((role) => {
          const isActive = rolePrefix === role;
          return (
            <button
              key={role}
              onClick={handleClick(role)}
              className={cn(
                'px-2.5 py-1 rounded-full text-[11px] font-medium transition-all duration-fast cursor-pointer',
                isActive
                  ? 'bg-brand text-brand-on shadow-sm'
                  : 'bg-surface text-text-muted border border-border hover:border-border-brand hover:text-brand'
              )}
              title={`单击：以${roleNames[role] || ''}身份发言 | 双击：AI自动生成`}
            >
              {labels[role]}
            </button>
          );
        })}

        {rolePrefix && (
          <span className="text-[10px] text-text-subtle animate-pulse">
            已激活 · 双击让AI代写
          </span>
        )}

        <button
          onClick={() => setShowEditPanel(!showEditPanel)}
          className={cn(
            'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition cursor-pointer',
            showEditPanel
              ? 'bg-brand text-brand-on'
              : 'bg-surface text-text-muted border border-dashed border-border-strong hover:border-border-brand hover:text-brand'
          )}
          title="编辑当前回复风格"
        >
          <Pencil className="w-3 h-3" />
          编辑
        </button>
      </div>

      {showEditPanel && (
        <div className="mt-2 p-3 bg-surface rounded-xl border border-border shadow-sm animate-in fade-in">
          <textarea
            className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-xs text-text placeholder:text-text-subtle focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 resize-none"
            rows={3}
            placeholder="输入回复风格指令，如：回复要俏皮可爱，多用颜文字，每句话都要加~"
            value={editPrompt}
            onChange={(e) => setEditPrompt(e.target.value)}
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => {
                setCustomResponsePrompt(editPrompt);
                localStorage.setItem('quick_response_prompt', editPrompt);
                setShowEditPanel(false);
              }}
              className="px-3 py-1.5 bg-brand text-brand-on rounded-lg text-xs font-medium hover:bg-brand-hover cursor-pointer"
            >
              应用
            </button>
            <button
              onClick={() => {
                setEditPrompt('');
                setCustomResponsePrompt('');
                localStorage.removeItem('quick_response_prompt');
                setShowEditPanel(false);
              }}
              className="px-3 py-1.5 text-xs text-text-muted hover:bg-surface-hover rounded-lg cursor-pointer"
            >
              重置
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
