import { useNavigate } from 'react-router-dom';
import { Brain, LogOut } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useLogout } from '../../hooks/useAuth';

export default function SidebarFooter() {
  const navigate = useNavigate();
  const user = useAppStore((s) => s.user);
  const logout = useLogout();

  return (
    <div className="p-4 border-t border-border bg-surface-hover/50 space-y-1">
      <button
        onClick={() => navigate('/memory')}
        className="flex items-center gap-2.5 w-full px-3 py-2 text-[13px] font-semibold text-text-muted hover:text-brand rounded-lg transition cursor-pointer"
      >
        <Brain className="w-4 h-4" />
        AI 记忆
      </button>
      <button
        onClick={logout}
        className="flex items-center gap-2.5 w-full px-3 py-2 text-[13px] font-semibold text-text-muted hover:text-danger hover:bg-danger-soft rounded-lg transition cursor-pointer"
      >
        <LogOut className="w-4 h-4" />
        退出登录
      </button>
    </div>
  );
}
