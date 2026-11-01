import { Sun, Moon, Palette, MessageSquare, Brain, History } from 'lucide-react';
import { Card, Textarea } from '../../../components/ui';
import { useSettings, useUpdateSettings } from '../../../hooks';
import { useTheme } from '../../../utils/theme';
import { cn } from '../../../lib/cn';

export default function GeneralTab() {
  const { data: settings = {} } = useSettings();
  const updateSettings = useUpdateSettings();
  const { theme, toggleTheme } = useTheme();

  const save = (data) => updateSettings.mutate(data);

  return (
    <Card className="p-6">
      {/* 外观 */}
      <div className="flex items-center gap-2 mb-4">
        <Palette className="w-4 h-4 text-text-subtle" />
        <h2 className="text-sm font-semibold text-text-subtle uppercase tracking-wider">外观</h2>
      </div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-medium text-text">主题模式</p>
          <p className="text-xs text-text-subtle">{theme === 'dark' ? '深色' : '浅色'}</p>
        </div>
        <button
          onClick={toggleTheme}
          className={cn(
            'relative w-14 h-7 rounded-full transition cursor-pointer',
            theme === 'dark' ? 'bg-brand' : 'bg-border-strong'
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform',
              theme === 'dark' && 'translate-x-7'
            )}
          />
        </button>
      </div>
      <div className="flex gap-2">
        {['light', 'dark', 'auto'].map((t) => (
          <button
            key={t}
            onClick={() => save({ theme: t })}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition',
              settings.theme === t
                ? 'bg-brand text-brand-on'
                : 'bg-surface-hover text-text-muted hover:bg-surface-active'
            )}
          >
            {{ light: '浅色', dark: '深色', auto: '自动' }[t]}
          </button>
        ))}
      </div>

      {/* 回答提示词 */}
      <div className="flex items-center gap-2 mt-6 mb-4">
        <MessageSquare className="w-4 h-4 text-text-subtle" />
        <h2 className="text-sm font-semibold text-text-subtle uppercase tracking-wider">回答提示词</h2>
      </div>
      <p className="text-xs text-text-subtle mb-2">
        全局生效——所有角色和对话都会自动追加这段格式指令
      </p>
      <Textarea
        rows={4}
        value={settings.response_prompt || ''}
        onChange={(e) => save({ response_prompt: e.target.value })}
        placeholder="例如：每次回复必须以一句动作描写开头，然后再说话。"
      />

      {/* AI 功能 */}
      <div className="flex items-center gap-2 mt-6 mb-4">
        <Brain className="w-4 h-4 text-text-subtle" />
        <h2 className="text-sm font-semibold text-text-subtle uppercase tracking-wider">AI 功能</h2>
      </div>
      {[
        { key: 'memory_enabled', label: '启用长记忆', desc: 'AI 自动记住关于你的事情' },
        { key: 'memory_auto_extract', label: '自动提取记忆', desc: '对话中自动提取关键信息' },
      ].map((item) => (
        <label key={item.key} className="flex items-center justify-between cursor-pointer py-2">
          <div>
            <span className="text-sm text-text">{item.label}</span>
            <p className="text-[11px] text-text-subtle">{item.desc}</p>
          </div>
          <input
            type="checkbox"
            checked={settings[item.key] !== false}
            onChange={(e) => save({ [item.key]: e.target.checked })}
            className="w-5 h-5 rounded text-brand focus:ring-brand cursor-pointer"
          />
        </label>
      ))}

      {/* 对话 */}
      <div className="flex items-center gap-2 mt-6 mb-4">
        <History className="w-4 h-4 text-text-subtle" />
        <h2 className="text-sm font-semibold text-text-subtle uppercase tracking-wider">对话</h2>
      </div>
      <div>
        <label className="block text-sm font-medium text-text mb-2">保留轮数</label>
        <input
          type="range"
          min="2"
          max="999"
          value={settings.max_history_rounds || 10}
          onChange={(e) => save({ max_history_rounds: parseInt(e.target.value) })}
          className="w-full accent-brand"
        />
        <div className="text-center text-sm text-brand mt-1 font-mono">
          {settings.max_history_rounds || 10} 轮
        </div>
      </div>
    </Card>
  );
}
