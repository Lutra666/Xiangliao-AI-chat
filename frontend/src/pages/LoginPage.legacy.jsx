import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, register, getServerUrl, setServerUrl } from '../utils/api';

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [form, setForm] = useState({ username: '', password: '', email: '', display_name: '', confirm_password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [serverUrl, setServerUrlState] = useState(getServerUrl());
  const [showServerInput, setShowServerInput] = useState(false);
  const [serverInput, setServerInput] = useState(serverUrl);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!isLogin) {
      if (form.password !== form.confirm_password) {
        setError('两次密码输入不一致');
        return;
      }
      if (form.password.length < 8) {
        setError('密码至少需要 8 个字符');
        return;
      }
      const hasLetter = /[A-Za-z]/.test(form.password);
      const hasDigit = /\d/.test(form.password);
      if (!hasLetter || !hasDigit) {
        setError('密码必须同时包含字母和数字');
        return;
      }
    }
    setLoading(true);
    try {
      if (isLogin) {
        await login(form.username, form.password);
      } else {
        await register(form);
      }
      navigate('/chat');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveServer = () => {
    const url = serverInput.trim().replace(/\/+$/, '');
    if (!url) return;
    setServerUrl(url);
    setServerUrlState(url);
    setShowServerInput(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-100
      dark:from-gray-950 dark:to-gray-900 px-4 transition-colors">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg dark:shadow-gray-900/50 p-6 md:p-10 w-full max-w-md transition-colors">
        <h1 className="text-2xl font-bold text-center text-gray-800 dark:text-gray-100 mb-2">
          享聊
        </h1>
        <p className="text-center text-gray-500 dark:text-gray-400 mb-6">
          {isLogin ? '登录你的账号' : '创建新账号'}
        </p>

        {/* 服务器地址 */}
        <div className="bg-gray-50 rounded-lg px-3 py-2 mb-4 flex items-center justify-between text-xs">
          <span className="text-text-muted truncate flex-1">
            服务器：{serverUrl}
          </span>
          <button
            className="text-brand hover:underline ml-2 shrink-0 cursor-pointer"
            onClick={() => { setServerInput(serverUrl); setShowServerInput(!showServerInput); }}
          >
            更改
          </button>
        </div>

        {/* 修改服务器地址 */}
        {showServerInput && (
          <div className="flex gap-2 mb-4">
            <input
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
              value={serverInput}
              onChange={(e) => setServerInput(e.target.value)}
              placeholder="http://127.0.0.1:8000"
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveServer(); }}
            />
            <button
              onClick={handleSaveServer}
              className="bg-brand text-white px-3 py-2 rounded-lg text-sm cursor-pointer hover:bg-brand-dark transition"
            >
              确认
            </button>
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">用户名</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              required
              minLength={3}
            />
          </div>

          {!isLogin && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">邮箱（选填）</label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="用于找回密码"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">昵称</label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                  value={form.display_name}
                  onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                  required
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">密码</label>
            <input
              type="password"
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              minLength={isLogin ? 6 : 8}
              pattern={isLogin ? undefined : '^(?=.*[A-Za-z])(?=.*\\d)[A-Za-z\\d]{8,}$'}
              title={isLogin ? undefined : '至少 8 位，包含字母和数字'}
            />
            {!isLogin && (
              <p className="text-xs text-gray-500 mt-1">至少 8 位，需同时包含字母和数字</p>
            )}
          </div>

          {!isLogin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">确认密码</label>
              <input
                type="password"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                value={form.confirm_password}
                onChange={(e) => setForm({ ...form, confirm_password: e.target.value })}
                required
                minLength={8}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand hover:bg-brand-dark text-white font-medium py-2.5 rounded-lg transition disabled:opacity-50 cursor-pointer"
          >
            {loading ? '处理中...' : isLogin ? '登录' : '注册'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          {isLogin ? '还没有账号？' : '已有账号？'}
          <button
            className="text-brand hover:underline ml-1 cursor-pointer"
            onClick={() => { setIsLogin(!isLogin); setError(''); }}
          >
            {isLogin ? '立即注册' : '去登录'}
          </button>
        </p>
      </div>
    </div>
  );
}
