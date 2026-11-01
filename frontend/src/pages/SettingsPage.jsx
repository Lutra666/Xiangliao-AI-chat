import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { cn } from '../lib/cn';
import { IconButton, Spinner } from '../components/ui';
import { useSettings } from '../hooks';
import GeneralTab from '../features/settings/tabs/GeneralTab';
import CharactersTab from '../features/settings/tabs/CharactersTab';
import ParamsTab from '../features/settings/tabs/ParamsTab';
import ProfileTab from '../features/settings/tabs/ProfileTab';

const TABS = [
  { key: 'general', label: '通用', icon: '⚙️' },
  { key: 'characters', label: '角色', icon: '🎭' },
  { key: 'params', label: 'AI参数', icon: '🎚️' },
  { key: 'profile', label: '账号', icon: '👤' },
];

export default function SettingsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('general');
  const [saved, setSaved] = useState(false);
  const { isLoading } = useSettings();

  // 监听 switchTab 事件（从 Sidebar 的"编辑角色"按钮触发）
  useEffect(() => {
    const handler = (e) => {
      if (e.detail && TABS.some((t) => t.key === e.detail)) setTab(e.detail);
    };
    window.addEventListener('switchTab', handler);
    return () => window.removeEventListener('switchTab', handler);
  }, []);

  // 监听设置更新成功（乐观更新后短暂显示"已保存"）
  useEffect(() => {
    if (isLoading) return;
    // 简单的保存提示：每次 tab 切换或加载完成时闪一下
  }, [isLoading, tab]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg transition-colors duration-slower">
      {/* 顶栏 */}
      <header className="bg-surface/95 backdrop-blur-xl border-b border-border sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <IconButton label="返回对话" variant="ghost" onClick={() => navigate('/chat')}>
            <ArrowLeft className="w-5 h-5" />
          </IconButton>
          <h1 className="text-lg font-semibold text-text-header">设置</h1>
          <div className="w-9" />
        </div>
        {/* Tab 切换 */}
        <div className="max-w-3xl mx-auto px-2 sm:px-4 flex gap-1 pb-2 overflow-x-auto scrollbar-hide">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition cursor-pointer flex-shrink-0',
                tab === t.key
                  ? 'bg-brand text-brand-on shadow-sm'
                  : 'text-text-muted hover:bg-surface-hover'
              )}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </header>

      {/* Tab 内容 */}
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {tab === 'general' && <GeneralTab />}
        {tab === 'characters' && <CharactersTab />}
        {tab === 'params' && <ParamsTab />}
        {tab === 'profile' && <ProfileTab />}
      </div>

      {/* 保存提示 */}
      {saved && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-brand text-brand-on px-6 py-2.5 rounded-full text-sm font-medium shadow-lg animate-in fade-in">
          <Check className="w-4 h-4 inline mr-1" />
          已保存
        </div>
      )}
    </div>
  );
}
