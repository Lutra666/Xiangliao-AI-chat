import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const ThemeContext = createContext(null);

// 圆形扩散动画的 clip-path 关键帧
const CIRCLE_EXPAND = `
@keyframes circle-expand {
  from { clip-path: circle(0% at var(--circle-x) var(--circle-y)); }
  to   { clip-path: circle(150% at var(--circle-x) var(--circle-y)); }
}
`;

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  // 应用主题到 <html>
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  // 带圆形扩散动画的切换
  const toggleTheme = useCallback((e) => {
    const x = e.clientX;
    const y = e.clientY;

    // 注入扩散动画样式（仅一次）
    if (!document.getElementById('circle-expand-style')) {
      const style = document.createElement('style');
      style.id = 'circle-expand-style';
      style.textContent = CIRCLE_EXPAND;
      document.head.appendChild(style);
    }

    const newTheme = theme === 'dark' ? 'light' : 'dark';

    // View Transition API — Chrome/Edge 支持圆形扩散
    if (document.startViewTransition) {
      document.documentElement.style.setProperty('--circle-x', x + 'px');
      document.documentElement.style.setProperty('--circle-y', y + 'px');
      document.startViewTransition(() => {
        setThemeState(newTheme);
      });
    } else {
      // 降级：CSS animation on html element
      const html = document.documentElement;
      html.style.setProperty('--circle-x', x + 'px');
      html.style.setProperty('--circle-y', y + 'px');
      html.classList.add('circle-animate');
      setThemeState(newTheme);
      setTimeout(() => html.classList.remove('circle-animate'), 500);
    }
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
