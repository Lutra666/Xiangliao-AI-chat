import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const initialUser = (() => {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
})();

const initialToken = (() => {
  try {
    return localStorage.getItem('token') || null;
  } catch {
    return null;
  }
})();

const initialServerUrl = (() => {
  try {
    if (window.electronAPI?.getServerUrl) {
      const u = window.electronAPI.getServerUrl();
      if (u) return u;
    }
    return localStorage.getItem('server_url') || window.location.origin;
  } catch {
    return window.location.origin;
  }
})();

const initialTheme = (() => {
  try {
    const saved = localStorage.getItem('theme');
    if (saved) return saved;
  } catch {}
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
})();

export const useAppStore = create(
  persist(
    (set) => ({
      user: initialUser,
      token: initialToken,
      serverUrl: initialServerUrl,
      theme: initialTheme,
      activeCharacterId: (() => {
        try {
          const v = parseInt(localStorage.getItem('active_character_id') || '0');
          return v || null;
        } catch {
          return null;
        }
      })(),

      setAuth: (user, token) => {
        set({ user, token });
        try {
          if (token) localStorage.setItem('token', token);
          else localStorage.removeItem('token');
          if (user) localStorage.setItem('user', JSON.stringify(user));
          else localStorage.removeItem('user');
        } catch {}
      },

      clearAuth: () => {
        set({ user: null, token: null });
        try {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
        } catch {}
      },

      setServerUrl: (url) => {
        const clean = String(url || '').replace(/\/+$/, '');
        set({ serverUrl: clean });
        try {
          localStorage.setItem('server_url', clean);
          if (window.electronAPI?.changeServerUrl) window.electronAPI.changeServerUrl(clean);
        } catch {}
      },

      setTheme: (theme) => {
        set({ theme });
        try {
          localStorage.setItem('theme', theme);
          document.documentElement.classList.toggle('dark', theme === 'dark');
        } catch {}
      },

      setActiveCharacterId: (id) => {
        const v = id || null;
        set({ activeCharacterId: v });
        try {
          if (v) localStorage.setItem('active_character_id', String(v));
          else localStorage.removeItem('active_character_id');
        } catch {}
      },
    }),
    {
      name: 'xiangliao-app-store',
      partialize: (state) => ({
        serverUrl: state.serverUrl,
        theme: state.theme,
        activeCharacterId: state.activeCharacterId,
      }),
    }
  )
);

export const getApiBase = () => {
  const { serverUrl } = useAppStore.getState();
  return `${serverUrl}/api`;
};

export const getServerUrl = () => useAppStore.getState().serverUrl;
