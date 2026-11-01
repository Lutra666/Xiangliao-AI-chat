import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSettings, updateSettings, listModels, getStoredUser, listCharacters, createCharacter, updateCharacter, deleteCharacter, setDefaultCharacter, getServerUrl } from '../utils/api';
import { useTheme } from '../utils/theme';

const TABS = [
  { key: 'general', label: '通用', icon: '⚙️' },
  { key: 'characters', label: '角色', icon: '🎭' },
  { key: 'params', label: 'AI参数', icon: '🎚️' },
  { key: 'profile', label: '账号', icon: '👤' },
];

export default function SettingsPage() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [tab, setTab] = useState('general');
  const [settings, setSettings] = useState({});
  const [models, setModels] = useState([]);
  const [characters, setCharacters] = useState([]);
  const [userAvatar, setUserAvatar] = useState('');
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const user = getStoredUser();

  const [newChar, setNewChar] = useState({ name: '', avatar_url: '🥰', description: '', system_prompt: '你是一个友好的AI助手。' });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editAvatarFile, setEditAvatarFile] = useState(null);

  useEffect(() => {
    Promise.all([
      getSettings().catch(() => ({})),
      listModels().catch(() => []),
      listCharacters(false).catch(() => []),
    ]).then(([s, m, c]) => {
      setSettings(s);
      setModels(m);
      setCharacters(c);
      setUserAvatar(user?.avatar_url || '');
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const saveSetting = async (data) => {
    try {
      await updateSettings(data);
      setSettings(prev => ({ ...prev, ...data }));
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e) { console.error(e); }
  };

  // response_prompt 防抖保存：输入停止 800ms 后自动存库
  const promptTimer = useRef(null);
  const savePromptDebounced = (value) => {
    setSettings(prev => ({ ...prev, response_prompt: value }));
    if (promptTimer.current) clearTimeout(promptTimer.current);
    promptTimer.current = setTimeout(() => {
      updateSettings({ response_prompt: value }).catch(console.error);
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    }, 800);
  };

  // 组件卸载时清理防抖定时器，避免内存泄漏和卸载后 setState
  useEffect(() => () => clearTimeout(promptTimer.current), []);

  const handleCreateChar = async () => {
    if (!newChar.name.trim()) return;
    try {
      await createCharacter(newChar);
      setNewChar({ name: '', avatar_url: '🥰', description: '', system_prompt: '你是一个友好的AI助手。' });
      const c = await listCharacters(false).catch(() => []);
      setCharacters(c);
    } catch (e) { console.error(e); }
  };

  const handleDeleteChar = async (id) => {
    if (!confirm('删除这个角色？')) return;
    await deleteCharacter(id);
    setCharacters(prev => prev.filter(c => c.id !== id));
  };

  const handleSetDefault = async (id) => {
    await setDefaultCharacter(id);
    const c = await listCharacters(false).catch(() => []);
    setCharacters(c);
  };

  const startEdit = (ch) => {
    setEditingId(ch.id);
    setEditForm({ ...ch, parameters: ch.parameters || {} });
    setEditAvatarFile(null);
  };

  const cancelEdit = () => { setEditingId(null); setEditForm({}); };

  const saveEdit = async () => {
    const { id, is_builtin, created_at, updated_at, user_id, ...data } = editForm;
    let avatar = editForm.avatar_url;
    if (editAvatarFile) {
      const form = new FormData(); form.append('file', editAvatarFile);
      const token = localStorage.getItem('token');
      const res = await fetch(`${getServerUrl()}/api/characters/avatar`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: form });
      if (res.ok) {
        const d = await res.json();
        avatar = d.avatar_url;
      } else {
        // 上传失败：提示并回退，不使用 blob URL 保存角色
        alert('头像上传失败，将使用原头像');
        return;
      }
    }
    try {
      await updateCharacter(id, { ...data, avatar_url: avatar });
      setEditingId(null);
      const c = await listCharacters(false).catch(() => []);
      setCharacters(c);
    } catch (e) { console.error(e); }
  };

  const handleAvatarUpload = () => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = e.target?.files?.[0]; if (!file) return;
      const form = new FormData(); form.append('file', file);
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${getServerUrl()}/api/auth/avatar`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: form });
        // 401 未授权：清理登录态并跳转登录页
        if (res.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          window.location.reload();
          return;
        }
        if (res.ok) {
          const d = await res.json();
          setUserAvatar(d.avatar_url);
          localStorage.setItem('user', JSON.stringify({ ...user, avatar_url: d.avatar_url }));
        }
      } catch (err) { console.error(err); }
    };
    input.click();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="animate-spin w-6 h-6 border-2 border-brand border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors">
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <button onClick={() => navigate('/chat')} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg cursor-pointer">
            <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-100">设置</h1>
          <div className="w-9" />
        </div>
        <div className="max-w-3xl mx-auto px-2 sm:px-4 flex flex-nowrap gap-1 pb-2 overflow-x-auto scrollbar-hide">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium whitespace-nowrap transition cursor-pointer flex-shrink-0 ${tab === t.key ? 'bg-brand text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

        {/* 通用 */}
        {tab === 'general' && (
          <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm dark:shadow-gray-900/30">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">外观</h2>
            <div className="flex items-center justify-between mb-4">
              <div><p className="text-sm font-medium text-gray-700 dark:text-gray-200">主题模式</p><p className="text-xs text-gray-400">{theme === 'dark' ? '暗色' : '亮色'}</p></div>
              <button onClick={toggleTheme}
                className={`relative w-14 h-7 rounded-full transition ${theme === 'dark' ? 'bg-brand' : 'bg-gray-300'}`}>
                <span className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${theme === 'dark' ? 'translate-x-7' : ''}`} />
              </button>
            </div>
            <div className="flex gap-2">
              {['light','dark','auto'].map(t => (
                <button key={t} onClick={() => saveSetting({ theme: t })}
                  className={`px-4 py-2 rounded-lg text-sm font-medium cursor-pointer ${settings.theme === t ? 'bg-brand text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                  {{light:'浅色',dark:'深色',auto:'自动'}[t]}
                </button>
              ))}
            </div>

            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mt-6 mb-4">回答提示词</h2>
            <p className="text-xs text-gray-400 mb-2">全局生效——所有角色和对话都会自动追加这段格式指令</p>
            <textarea className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 rounded-xl px-3 py-2 text-sm" rows="4"
              value={settings.response_prompt || ''}
              onChange={e => savePromptDebounced(e.target.value)}
              placeholder="例如：每次回复必须以一句动作描写开头，然后再说话。输入停止后会自动保存。" />

            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mt-6 mb-4">AI 功能</h2>
            {[{key:'memory_enabled',label:'启用长记忆',desc:'AI自动记住关于你的事情'},{key:'memory_auto_extract',label:'自动提取记忆',desc:'对话中自动提取关键信息'}].map(item => (
              <label key={item.key} className="flex items-center justify-between cursor-pointer py-2">
                <div><span className="text-sm text-gray-700 dark:text-gray-200">{item.label}</span><p className="text-[11px] text-gray-400">{item.desc}</p></div>
                <input type="checkbox" checked={settings[item.key] !== false} onChange={e => saveSetting({ [item.key]: e.target.checked })}
                  className="w-5 h-5 rounded text-brand focus:ring-brand cursor-pointer" />
              </label>
            ))}

            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mt-6 mb-4">对话</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">保留轮数</label>
              <input type="range" min="2" max="999" value={settings.max_history_rounds || 10}
                onChange={e => saveSetting({ max_history_rounds: parseInt(e.target.value) })} className="w-full" />
              <div className="text-center text-sm text-brand mt-1">{settings.max_history_rounds || 10} 轮</div>
            </div>
          </section>
        )}

        {/* 角色 */}
        {tab === 'characters' && (
          <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm dark:shadow-gray-900/30">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">创建角色</h2>
            <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-xl space-y-2 mb-6">
              <div className="grid grid-cols-2 gap-2">
                <input className="border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="角色名" value={newChar.name} onChange={e => setNewChar({...newChar, name: e.target.value})} />
                <input className="border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="头像emoji" value={newChar.avatar_url} onChange={e => setNewChar({...newChar, avatar_url: e.target.value})} />
              </div>
              <input className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="简介" value={newChar.description} onChange={e => setNewChar({...newChar, description: e.target.value})} />
              <textarea className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 rounded-lg px-3 py-2 text-sm" rows="3" placeholder="系统提示词" value={newChar.system_prompt} onChange={e => setNewChar({...newChar, system_prompt: e.target.value})} />
              <button onClick={handleCreateChar} className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand-dark cursor-pointer">保存角色</button>
            </div>

            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">我的角色 ({characters.length})</h2>
            <div className="space-y-3">
              {characters.map(ch => (
                <div key={ch.id} className="bg-gray-50 dark:bg-gray-900 rounded-xl overflow-hidden">
                  {editingId === ch.id ? (
                    /* ── 编辑模式 ── */
                    <div className="p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <button onClick={() => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.onchange = (e) => { const f = e.target.files[0]; if (f) { setEditAvatarFile(f); setEditForm({ ...editForm, avatar_url: URL.createObjectURL(f) }); } }; inp.click(); }}>
                          {editForm.avatar_url?.startsWith('blob:') || editAvatarFile ? (
                            <img src={editForm.avatar_url} alt="" className="w-12 h-12 rounded-xl object-cover" />
                          ) : editForm.avatar_url?.startsWith('/') ? (
                            <img src={editForm.avatar_url} alt="" className="w-12 h-12 rounded-xl object-cover" />
                          ) : (
                            <div className="w-12 h-12 rounded-xl bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-2xl cursor-pointer hover:bg-gray-300">{editForm.avatar_url || '🥰'}</div>
                          )}
                        </button>
                        <input className="flex-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 rounded-lg px-3 py-2 text-sm font-medium" value={editForm.name || ''} onChange={e => setEditForm({ ...editForm, name: e.target.value })} placeholder="角色名" />
                      </div>
                      <input className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 rounded-lg px-3 py-2 text-sm" value={editForm.avatar_url || ''} onChange={e => setEditForm({ ...editForm, avatar_url: e.target.value })} placeholder="头像URL/emoji" />
                      <input className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 rounded-lg px-3 py-2 text-sm" value={editForm.description || ''} onChange={e => setEditForm({ ...editForm, description: e.target.value })} placeholder="简介" />
                      <textarea className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 rounded-lg px-3 py-2 text-sm" rows="4" value={editForm.system_prompt || ''} onChange={e => setEditForm({ ...editForm, system_prompt: e.target.value })} placeholder="系统提示词" />
                      {/* 参数编辑 */}
                      <div className="grid grid-cols-3 gap-2">
                        {['temperature','top_p','max_tokens'].map(k => (
                          <div key={k}><label className="text-[10px] text-gray-400">{k}</label>
                            <input className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 rounded-lg px-2 py-1.5 text-xs" type="number" step="0.01"
                              value={editForm.parameters?.[k] ?? ''} onChange={e => setEditForm({ ...editForm, parameters: { ...editForm.parameters, [k]: parseFloat(e.target.value) || 0 } })} />
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-1.5 text-xs text-gray-500"><input type="checkbox" checked={!!editForm.is_default} onChange={e => setEditForm({ ...editForm, is_default: e.target.checked })} className="rounded" />默认角色</label>
                        <label className="flex items-center gap-1.5 text-xs text-gray-500"><input type="checkbox" checked={!!editForm.is_public} onChange={e => setEditForm({ ...editForm, is_public: e.target.checked })} className="rounded" />公开分享</label>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={saveEdit} className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand-dark cursor-pointer">保存</button>
                        <button onClick={cancelEdit} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg cursor-pointer">取消</button>
                      </div>
                    </div>
                  ) : (
                    /* ── 预览模式 ── */
                    <div className="flex items-center gap-3 p-3 group">
                      {ch.avatar_url?.startsWith('/') ? (
                        <img src={ch.avatar_url} alt="" className="w-10 h-10 rounded-xl object-cover shrink-0" />
                      ) : (
                        <span className="text-3xl shrink-0">{ch.avatar_url || '🥰'}</span>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{ch.name}</p>
                          {ch.is_default && <span className="text-[10px] px-1.5 py-0.5 bg-brand/10 text-brand rounded-full">默认</span>}
                        </div>
                        {ch.description && <p className="text-[11px] text-gray-400">{ch.description}</p>}
                        <p className="text-[11px] text-gray-400 truncate mt-0.5">{ch.system_prompt?.slice(0, 60)}...</p>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                        <button onClick={() => startEdit(ch)} className="px-2 py-1 text-[10px] text-brand hover:bg-brand/10 rounded cursor-pointer font-medium">编辑</button>
                        {!ch.is_default && <button onClick={() => handleSetDefault(ch.id)} className="px-2 py-1 text-[10px] text-brand hover:bg-brand/10 rounded cursor-pointer">默认</button>}
                        <button onClick={() => handleDeleteChar(ch.id)} className="px-2 py-1 text-[10px] text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded cursor-pointer">删除</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {characters.length === 0 && <p className="text-center text-sm text-gray-400 py-8">还没有自定义角色</p>}
            </div>
          </section>
        )}

        {/* AI参数 */}
        {tab === 'params' && (
          <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm dark:shadow-gray-900/30">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">默认参数</h2>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">默认模型</label>
                <select value={settings.default_model || 'deepseek-v4-flash'}
                  onChange={e => saveSetting({ default_model: e.target.value })}
                  className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 rounded-lg px-3 py-2.5 text-sm">
                  {models.map(m => (<option key={m.id} value={m.id}>{m.name} — {m.description}</option>))}
                </select>
              </div>
              {[{key:'temperature',label:'创造性',min:0,max:2,step:0.05,def:0.7},{key:'top_p',label:'Top P',min:0,max:1,step:0.05,def:0.9},{key:'max_tokens',label:'最大长度',min:64,max:8192,step:64,def:2048}].map(p => (
                <div key={p.key}>
                  <div className="flex justify-between mb-1"><label className="text-xs font-medium text-gray-600 dark:text-gray-400">{p.label}</label><span className="text-xs text-brand font-mono">{settings.default_parameters?.[p.key] ?? p.def}</span></div>
                  <input type="range" min={p.min} max={p.max} step={p.step} value={settings.default_parameters?.[p.key] ?? p.def}
                    onChange={e => { const np = {...(settings.default_parameters || {}), [p.key]: parseFloat(e.target.value) }; saveSetting({ default_parameters: np }); }}
                    className="w-full" />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 账号 */}
        {tab === 'profile' && (
          <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm dark:shadow-gray-900/30">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">账号信息</h2>
            <div className="flex items-center gap-4 mb-6">
              <div className="relative cursor-pointer group" onClick={handleAvatarUpload}>
                {userAvatar ? <img src={userAvatar} alt="" className="w-16 h-16 rounded-2xl object-cover ring-2 ring-brand/20" />
                  : <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand to-violet-500 flex items-center justify-center text-2xl text-white">👤</div>}
                <div className="absolute inset-0 bg-black/20 rounded-2xl opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                </div>
              </div>
              <div><p className="font-semibold text-gray-800 dark:text-gray-100">{user.display_name}</p><p className="text-sm text-gray-500">@{user.username}</p></div>
            </div>
            <div className="space-y-3 text-sm">
              {[{k:'用户名',v:user.username},{k:'昵称',v:user.display_name},{k:'邮箱',v:user.email||'未设置'},{k:'角色',v:user.role==='admin'?'管理员':'用户'}].map(r => (
                <div key={r.k} className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700"><span className="text-gray-500">{r.k}</span><span className="font-medium text-gray-800 dark:text-gray-200">{r.v}</span></div>
              ))}
            </div>
          </section>
        )}

        {saved && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-brand text-white px-6 py-2.5 rounded-full text-sm font-medium shadow-lg">✓ 已保存</div>}
      </div>
    </div>
  );
}
