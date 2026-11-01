import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Server, AlertCircle } from 'lucide-react';
import { cn } from '../lib/cn';
import { Button, Input } from '../components/ui';
import { useLogin, useRegister } from '../hooks';
import { useAppStore } from '../store/useAppStore';

export default function LoginPage() {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [form, setForm] = useState({
    username: '',
    password: '',
    email: '',
    display_name: '',
    confirm_password: '',
  });
  const [error, setError] = useState('');
  const [showServerInput, setShowServerInput] = useState(false);
  const [serverInput, setServerInput] = useState('');

  const serverUrl = useAppStore((s) => s.serverUrl);
  const setServerUrl = useAppStore((s) => s.setServerUrl);
  const loginMut = useLogin();
  const registerMut = useRegister();

  const loading = loginMut.isPending || registerMut.isPending;

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
      if (!/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) {
        setError('密码必须同时包含字母和数字');
        return;
      }
    }
    try {
      if (isLogin) {
        await loginMut.mutateAsync({ username: form.username, password: form.password });
      } else {
        await registerMut.mutateAsync(form);
      }
      navigate('/chat');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSaveServer = () => {
    const url = serverInput.trim().replace(/\/+$/, '');
    if (!url) return;
    setServerUrl(url);
    setShowServerInput(false);
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 transition-colors duration-slower"
      style={{
        background:
          'radial-gradient(ellipse at top, var(--color-brand-soft), var(--color-bg))',
      }}
    >
      <div className="bg-surface rounded-2xl shadow-xl p-6 md:p-10 w-full max-w-md transition-all duration-slower animate-in zoom-in-95">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand to-rose-400 flex items-center justify-center shadow-lg shadow-brand/20 mb-4">
            <span className="text-2xl font-bold text-brand-on">享</span>
          </div>
          <h1 className="text-2xl font-bold text-text-header">享聊</h1>
          <p className="text-text-muted mt-1">{isLogin ? '登录你的账号' : '创建新账号'}</p>
        </div>

        {/* 服务器地址 */}
        <div className="bg-surface-hover rounded-lg px-3 py-2 mb-4 flex items-center justify-between text-xs">
          <span className="text-text-muted truncate flex-1 inline-flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5 shrink-0" />
            {serverUrl}
          </span>
          <button
            className="text-brand hover:underline ml-2 shrink-0 cursor-pointer"
            onClick={() => {
              setServerInput(serverUrl);
              setShowServerInput(!showServerInput);
            }}
          >
            更改
          </button>
        </div>

        {showServerInput && (
          <div className="flex gap-2 mb-4 animate-in fade-in">
            <Input
              value={serverInput}
              onChange={(e) => setServerInput(e.target.value)}
              placeholder="http://127.0.0.1:8000"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveServer();
              }}
            />
            <Button variant="primary" onClick={handleSaveServer}>
              确认
            </Button>
          </div>
        )}

        {error && (
          <div className="bg-danger-soft text-danger px-4 py-3 rounded-lg mb-4 text-sm flex items-center gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text mb-1.5">用户名</label>
            <Input
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              required
              minLength={3}
            />
          </div>

          {!isLogin && (
            <>
              <div>
                <label className="block text-sm font-medium text-text mb-1.5">邮箱（选填）</label>
                <Input
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="用于找回密码"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text mb-1.5">昵称</label>
                <Input
                  value={form.display_name}
                  onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                  required
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-text mb-1.5">密码</label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              minLength={isLogin ? 6 : 8}
              pattern={
                isLogin ? undefined : '^(?=.*[A-Za-z])(?=.*\\d)[A-Za-z\\d]{8,}$'
              }
              title={isLogin ? undefined : '至少 8 位，包含字母和数字'}
            />
            {!isLogin && (
              <p className="text-xs text-text-subtle mt-1.5">至少 8 位，需同时包含字母和数字</p>
            )}
          </div>

          {!isLogin && (
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">确认密码</label>
              <Input
                type="password"
                value={form.confirm_password}
                onChange={(e) => setForm({ ...form, confirm_password: e.target.value })}
                required
                minLength={8}
              />
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            disabled={loading}
            loading={loading}
          >
            {isLogin ? '登录' : '注册'}
          </Button>
        </form>

        <p className="text-center text-sm text-text-muted mt-6">
          {isLogin ? '还没有账号？' : '已有账号？'}
          <button
            className="text-brand hover:underline ml-1 cursor-pointer font-medium"
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
            }}
          >
            {isLogin ? '立即注册' : '去登录'}
          </button>
        </p>
      </div>
    </div>
  );
}
