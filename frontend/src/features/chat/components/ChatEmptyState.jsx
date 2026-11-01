import { getTimeSuggestions, getGreeting } from '../constants';
import { useChatStore } from '../../../store/useChatStore';
import { useAppStore } from '../../../store/useAppStore';
import { Avatar } from '../../../components/ui';

export default function ChatEmptyState({ onQuickSend }) {
  const character = useChatStore((s) => s.character);
  const lastTiming = useChatStore((s) => s.lastTiming);
  const user = useAppStore((s) => s.user);
  const userAvatar = user?.avatar_url || '';

  const suggestions = getTimeSuggestions();
  const greeting = getGreeting();

  return (
    <div className="flex flex-col items-center justify-center pt-10 md:pt-20">
      {/* Logo */}
      <div className="relative mb-8">
        <div
          className="w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-gradient-to-br from-brand to-rose-400
            flex items-center justify-center shadow-xl shadow-brand/20 animate-in zoom-in-95"
        >
          {userAvatar ? (
            <img src={userAvatar} alt="" className="w-full h-full rounded-2xl object-cover" />
          ) : (
            <span className="text-4xl md:text-5xl">{character?.avatar_url || '🥰'}</span>
          )}
        </div>
        <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-brand rounded-full border-2 border-bg flex items-center justify-center">
          <span className="w-2 h-2 bg-brand-on rounded-full animate-pulse" />
        </div>
      </div>

      <h2 className="text-xl md:text-2xl font-bold text-text-header mb-2 animate-in fade-in slide-in-from-bottom-4">
        {greeting}
        {character ? `，我是 ${character.name}` : '，我是享聊'}
      </h2>
      <p className="text-sm text-text-muted mb-8 max-w-xs text-center leading-relaxed">
        {character?.description || '选择一个角色开始对话，或者直接告诉我你想聊什么。'}
      </p>

      {lastTiming && (
        <div className="flex items-center gap-2 mb-8 px-4 py-2 bg-surface-hover rounded-full border border-border text-[11px] text-text-muted">
          <span>⚡</span>
          上次响应：
          {lastTiming.cached
            ? '缓存命中 (0s)'
            : `思考 ${(lastTiming.ttft_ms / 1000).toFixed(1)}s · 总计 ${(
                lastTiming.total_ms / 1000
              ).toFixed(1)}s`}
        </div>
      )}

      {/* 建议卡片 */}
      <div className="w-full max-w-md">
        <p className="text-[11px] text-text-subtle font-medium mb-3 text-center tracking-wider uppercase">
          💡 试试这些
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => onQuickSend?.(s.text)}
              className="group flex flex-col items-center gap-2 p-3.5 bg-surface hover:bg-surface-hover
                rounded-xl border border-border hover:border-border-brand
                hover:shadow-md transition-all duration-normal cursor-pointer hover:-translate-y-0.5
                animate-in fade-in slide-in-from-bottom-2"
              style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'both' }}
            >
              <span className="text-2xl group-hover:scale-110 transition-transform duration-normal">
                {s.icon}
              </span>
              <span className="text-[11px] text-text-muted text-center leading-tight group-hover:text-brand">
                {s.text}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-4 text-[10px] text-text-subtle">
        <span>⌨️ Enter 发送</span>
        <span>⇧ Enter 换行</span>
        <span>🎭 切换角色</span>
        <span>🎚️ 调节参数</span>
      </div>
    </div>
  );
}
