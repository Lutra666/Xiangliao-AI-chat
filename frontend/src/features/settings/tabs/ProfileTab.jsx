import { useState } from 'react';
import { Camera } from 'lucide-react';
import { Card, Avatar } from '../../../components/ui';
import { useAppStore } from '../../../store/useAppStore';
import { getServerUrl } from '../../../store/useAppStore';

export default function ProfileTab() {
  const user = useAppStore((s) => s.user);
  const [userAvatar, setUserAvatar] = useState(user?.avatar_url || '');

  const handleAvatarUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = e.target?.files?.[0];
      if (!file) return;
      const form = new FormData();
      form.append('file', file);
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${getServerUrl()}/api/auth/avatar`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
        if (res.status === 401) {
          useAppStore.getState().clearAuth();
          window.location.reload();
          return;
        }
        if (res.ok) {
          const d = await res.json();
          setUserAvatar(d.avatar_url);
          useAppStore.getState().setAuth({ ...user, avatar_url: d.avatar_url }, useAppStore.getState().token);
        }
      } catch (err) {
        console.error(err);
      }
    };
    input.click();
  };

  const rows = [
    { k: '用户名', v: user?.username },
    { k: '昵称', v: user?.display_name },
    { k: '邮箱', v: user?.email || '未设置' },
    { k: '角色', v: user?.role === 'admin' ? '管理员' : '用户' },
  ];

  return (
    <Card className="p-6">
      <h2 className="text-sm font-semibold text-text-subtle uppercase tracking-wider mb-4">
        账号信息
      </h2>
      <div className="flex items-center gap-4 mb-6">
        <div className="relative cursor-pointer group" onClick={handleAvatarUpload}>
          {userAvatar ? (
            <img
              src={userAvatar}
              alt=""
              className="w-16 h-16 rounded-2xl object-cover ring-2 ring-brand/20"
            />
          ) : (
            <Avatar emoji="👤" size="xl" gradient="brand" />
          )}
          <div className="absolute inset-0 bg-black/20 rounded-2xl opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
            <Camera className="w-5 h-5 text-white" />
          </div>
        </div>
        <div>
          <p className="font-semibold text-text-header">{user?.display_name}</p>
          <p className="text-sm text-text-muted">@{user?.username}</p>
        </div>
      </div>
      <div className="space-y-3 text-sm">
        {rows.map((r) => (
          <div
            key={r.k}
            className="flex justify-between py-2 border-b border-border"
          >
            <span className="text-text-muted">{r.k}</span>
            <span className="font-medium text-text">{r.v}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
