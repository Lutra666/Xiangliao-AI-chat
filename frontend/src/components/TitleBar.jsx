import { useState, useEffect } from 'react';

export default function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const api = window.electronAPI;

  useEffect(() => {
    if (!api) return;
    api.isMaximized().then(setIsMaximized);
    // onMaximizeChange 返回 unsubscribe 函数，在 cleanup 中调用以移除监听器
    const unsubscribe = api.onMaximizeChange(setIsMaximized);
    return () => { if (typeof unsubscribe === 'function') unsubscribe(); };
  }, [api]);

  if (!api) return null;

  return (
    <div
      className="flex items-center justify-between select-none shrink-0"
      style={{
        height: 38,
        background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
        WebkitAppRegion: 'drag',
      }}
    >
      {/* 左侧: Logo + 标题 */}
      <div className="flex items-center gap-2.5 pl-4">
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.15)' }}
        >
          <span className="text-white text-[10px] font-extrabold tracking-tight">QA</span>
        </div>
        <span className="text-white text-[13px] font-semibold tracking-tight">
          校园问答助手
        </span>
      </div>

      {/* 右侧: 窗口控制按钮 */}
      <div
        className="flex h-full"
        style={{ WebkitAppRegion: 'no-drag' }}
      >
        <WindowButton onClick={() => api.minimize()} title="最小化">
          <svg width="11" height="11" viewBox="0 0 11 11">
            <rect x="1" y="5" width="9" height="1" fill="currentColor" />
          </svg>
        </WindowButton>

        <WindowButton onClick={() => api.maximize()} title={isMaximized ? '还原' : '最大化'}>
          {isMaximized ? (
            <svg width="11" height="11" viewBox="0 0 11 11">
              <rect x="2.5" y="0.5" width="7" height="7" rx="1" fill="none" stroke="currentColor" strokeWidth="1" />
              <rect x="0.5" y="2.5" width="7" height="7" rx="1" fill="rgba(255,255,255,0.9)" stroke="currentColor" strokeWidth="1" />
            </svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 11 11">
              <rect x="1" y="1" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1" />
            </svg>
          )}
        </WindowButton>

        <WindowButton onClick={() => api.close()} title="关闭" isClose>
          <svg width="11" height="11" viewBox="0 0 11 11">
            <path d="M1 1l9 9M10 1l-9 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </WindowButton>
      </div>
    </div>
  );
}

function WindowButton({ children, onClick, title, isClose = false }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex items-center justify-center transition-colors cursor-pointer"
      style={{
        width: 46,
        height: 38,
        color: 'rgba(255,255,255,0.85)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = isClose
          ? '#e81123'
          : 'rgba(255,255,255,0.12)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      {children}
    </button>
  );
}
