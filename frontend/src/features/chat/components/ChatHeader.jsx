import { useNavigate } from 'react-router-dom';
import { Menu, Settings, Maximize2, Sun, Moon, Square, Hash, Coins } from 'lucide-react';
import { IconButton, Tooltip } from '../../../components/ui';
import { useChatStore } from '../../../store/useChatStore';
import { useTheme } from '../../../utils/theme';
import { cn } from '../../../lib/cn';

export default function ChatHeader({ onToggleSidebar, headerVisible, onAbort }) {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const sessionId = useChatStore((s) => s.sessionId);
  const sessionTitle = useChatStore((s) => s.sessionTitle);
  const sessionTokens = useChatStore((s) => s.sessionTokens);
  const character = useChatStore((s) => s.character);
  const loading = useChatStore((s) => s.loading);

  return (
    <header
      className={cn(
        'border-b border-border flex items-center justify-between',
        'px-3 md:px-5 bg-surface/95 backdrop-blur-xl',
        'fixed top-0 left-0 right-0 md:static z-20 shrink-0',
        'transition-transform duration-slow',
        headerVisible ? 'translate-y-0' : '-translate-y-full'
      )}
      style={{ paddingTop: 'max(36px, env(safe-area-inset-top, 0px))', minHeight: 56 }}
    >
      {/* 左侧：菜单 + 全屏 + 设置 + 角色名 */}
      <div className="flex items-center gap-2 min-w-0">
        <IconButton
          label="会话列表"
          variant="ghost"
          className="md:hidden"
          onClick={onToggleSidebar}
        >
          <Menu className="w-5 h-5" />
        </IconButton>

        <IconButton
          label="全屏"
          variant="ghost"
          className="md:hidden"
          onClick={() => {
            if (document.fullscreenElement) document.exitFullscreen();
            else document.documentElement.requestFullscreen();
          }}
        >
          <Maximize2 className="w-5 h-5" />
        </IconButton>

        <Tooltip content="设置" side="bottom">
          <IconButton label="设置" variant="ghost" onClick={() => navigate('/settings')}>
            <Settings className="w-5 h-5" />
          </IconButton>
        </Tooltip>

        {character && (
          <span className="text-sm text-text-muted hidden sm:inline truncate">
            {character.avatar_url} {character.name}
          </span>
        )}
      </div>

      {/* 右侧：token + 费用 + 标题 + 主题 + 停止 */}
      <div className="flex items-center gap-1 min-w-0">
        {sessionId && sessionTokens > 0 && (
          <Tooltip content="本会话累计 token 用量" side="bottom">
            <span className="text-[10px] text-text-subtle hidden sm:inline-flex items-center gap-0.5">
              <Hash className="w-3 h-3" />
              {(sessionTokens / 1000).toFixed(1)}k
            </span>
          </Tooltip>
        )}
        {sessionId && sessionTokens > 0 && (
          <Tooltip content="基于真实 token 的估算费用（按 ¥2/百万 token）" side="bottom">
            <span className="text-[10px] text-text-subtle hidden sm:inline-flex items-center gap-0.5">
              <Coins className="w-3 h-3" />≈¥{((sessionTokens / 1000000) * 2).toFixed(3)}
            </span>
          </Tooltip>
        )}

        <h1 className="text-[13px] font-medium text-text-subtle truncate max-w-[120px] md:max-w-[200px] hidden sm:block">
          {sessionId ? sessionTitle || '对话中…' : '新对话'}
        </h1>

        <IconButton
          label={theme === 'dark' ? '切换亮色模式' : '切换暗色模式'}
          variant="ghost"
          onClick={toggleTheme}
        >
          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </IconButton>

        {loading && (
          <IconButton
            label="停止生成"
            variant="ghost"
            className="text-danger hover:text-danger hover:bg-danger-soft"
            onClick={onAbort}
          >
            <Square className="w-4 h-4 fill-current" />
          </IconButton>
        )}
      </div>
    </header>
  );
}
