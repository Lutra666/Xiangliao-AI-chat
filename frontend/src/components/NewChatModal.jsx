import { useState, useEffect } from 'react';
import { listCharacters, createCharacter, getServerUrl } from '../utils/api';

export default function NewChatModal({ onSelect, onClose }) {
  const [chars, setChars] = useState([]);
  const [newChar, setNewChar] = useState({ name: '', avatar_url: '🥰', system_prompt: '你是享聊，{{user_name}}的AI伙伴。每次回复都应像一段生动的叙事：用*斜体*描写动作神态，自然地融入环境氛围、心理活动和对话。' });
  const [avatarFile, setAvatarFile] = useState(null);

  // 懒加载角色列表（必须在 useEffect 中执行，避免 render 期间更新 state）
  useEffect(() => {
    let cancelled = false;
    listCharacters(false).then(list => { if (!cancelled) setChars(list); })
      .catch(() => { if (!cancelled) setChars([]); });
    return () => { cancelled = true; };
  }, []);

  const handleCreate = async () => {
    if (!newChar.name.trim()) return;
    try {
      let avatar = newChar.avatar_url;
      if (avatarFile) {
        const form = new FormData(); form.append('file', avatarFile);
        const res = await fetch(`${getServerUrl()}/api/characters/avatar`,
          { method: 'POST', headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }, body: form });
        if (res.ok) {
          const d = await res.json();
          avatar = d.avatar_url;
        } else {
          // 上传失败：提示并回退，不使用 blob URL 创建角色
          alert('头像上传失败，将使用默认头像');
          avatar = '🥰';
        }
      }
      const created = await createCharacter({ ...newChar, avatar_url: avatar });
      onSelect(created.id);
    } catch (e) {
      console.error(e);
      alert('创建角色失败，请重试');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white dark:bg-[#241820] rounded-3xl shadow-2xl p-6 w-[360px] max-h-[520px] overflow-y-auto animate-in zoom-in-95">
        <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-1">开启新对话</h2>
        <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">选择一个角色，或创建新的</p>

        {/* 默认 */}
        <button onClick={() => onSelect(null)}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl mb-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 border border-transparent transition cursor-pointer">
          <span className="text-2xl">🥰</span>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">默认助手</span>
        </button>

        {/* 用户角色 */}
        {chars.map(ch => (
          <button key={ch.id} onClick={() => onSelect(ch.id)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl mb-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 border border-transparent transition cursor-pointer">
            {ch.avatar_url?.startsWith('/') ? (
              <img src={ch.avatar_url} alt="" className="w-8 h-8 rounded-xl object-cover" />
            ) : (
              <span className="text-2xl">{ch.avatar_url || '🥰'}</span>
            )}
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{ch.name}</span>
          </button>
        ))}

        {/* 创建 */}
        <div className="border-t border-gray-100 dark:border-gray-700 pt-4 mt-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">创建新角色</p>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <button onClick={() => {
                const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
                inp.onchange = (e) => { const f = e.target.files[0]; if (f) { setAvatarFile(f); setNewChar({ ...newChar, avatar_url: URL.createObjectURL(f) }); } };
                inp.click();
              }}>
                {avatarFile ? (
                  <img src={newChar.avatar_url} alt="" className="w-10 h-10 rounded-xl object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-lg cursor-pointer hover:bg-gray-200 transition">{newChar.avatar_url}</div>
                )}
              </button>
              <input className="flex-1 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-xl px-3 py-2 text-sm"
                placeholder="角色名称" value={newChar.name} onChange={e => setNewChar({ ...newChar, name: e.target.value })} />
            </div>
            <textarea className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-xl px-3 py-2 text-xs" rows="2"
              placeholder="系统提示词" value={newChar.system_prompt} onChange={e => setNewChar({ ...newChar, system_prompt: e.target.value })} />
            <button onClick={handleCreate} disabled={!newChar.name.trim()}
              className="w-full py-2 bg-brand text-white rounded-xl text-sm font-medium hover:bg-brand-dark disabled:opacity-40 cursor-pointer transition">
              创建并开始对话
            </button>
          </div>
        </div>

        <button onClick={onClose}
          className="w-full mt-3 py-2 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition">
          取消
        </button>
      </div>
    </div>
  );
}
