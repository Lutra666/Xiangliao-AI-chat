import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSessions, deleteSession, inheritSession, getStoredUser, listCharacters, createCharacter, getServerUrl } from '../utils/api';

export default function Sidebar({ activeId, onSelect, onNew, onRefresh, onDeleteSession, activeCharId, onSelectChar }) {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [characters, setCharacters] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [newChar, setNewChar] = useState({ name: '', avatar_url: '🥰', description: '', system_prompt: '你是享聊，{{user_name}}的AI伙伴。\n\n【重要】每次回复必须以一句动作描写开头（*斜体*），然后再说话。对话中可以穿插动作描写。只说话不描写是违规的。\n\n示例：*轻轻靠过来，目光温柔地看向你* 我觉得……*端起茶杯抿了一口*' });
  const [charAvatarFile, setCharAvatarFile] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [pinnedIds, setPinnedIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pinned_sessions') || '[]'); } catch { return []; }
  });

  useEffect(() => {
    getSessions().then(setSessions).catch(() => {});
    listCharacters(false).then(setCharacters).catch(() => {});
  }, [refreshKey, onRefresh]);

  const togglePin = (e, id) => {
    e.stopPropagation();
    const newPinned = pinnedIds.includes(id)
      ? pinnedIds.filter(pid => pid !== id)
      : [...pinnedIds, id];
    setPinnedIds(newPinned);
    localStorage.setItem('pinned_sessions', JSON.stringify(newPinned));
  };

  // 搜索过滤 + 置顶排序
  const filteredSessions = sessions.filter(s =>
    !searchQuery || (s.title || '').toLowerCase().includes(searchQuery.toLowerCase())
  );
  const pinnedSessions = filteredSessions.filter(s => pinnedIds.includes(s.id));
  const normalSessions = filteredSessions.filter(s => !pinnedIds.includes(s.id));

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    try { await deleteSession(id); setRefreshKey(k => k + 1); if (activeId === id && onDeleteSession) onDeleteSession(id); }
    catch (e) { console.debug(e); }
  };

  const handleCreateChar = async () => {
    if (!newChar.name.trim()) return;
    try {
      let avatar = newChar.avatar_url;
      // 上传自定义头像图片
      if (charAvatarFile) {
        const form = new FormData(); form.append('file', charAvatarFile);
        const token = localStorage.getItem('token');
        const res = await fetch(`${getServerUrl()}/api/characters/avatar`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: form });
        if (res.ok) {
          const d = await res.json();
          avatar = d.avatar_url;
        } else {
          // 上传失败：提示并回退，不使用 blob URL 创建角色
          alert('头像上传失败，将使用默认头像');
          avatar = '🥰';
        }
      }
      await createCharacter({ ...newChar, avatar_url: avatar });
      setNewChar({ name: '', avatar_url: '🥰', description: '', system_prompt: '你是享聊，{{user_name}}的AI伙伴。\n\n【重要】每次回复必须以一句动作描写开头（*斜体*），然后再说话。对话中可以穿插动作描写。只说话不描写是违规的。\n\n示例：*轻轻靠过来，目光温柔地看向你* 我觉得……*端起茶杯抿了一口*' });
      setCharAvatarFile(null); setShowCreate(false);
      const chars = await listCharacters(false);
      setCharacters(chars);
    } catch (e) { console.error(e); }
  };

  const user = getStoredUser();

  return (
    <div className="w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col h-screen shrink-0 transition-colors">
      {/* Logo */}
      <div className="p-5 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-rose-400 to-pink-500 flex items-center justify-center text-white shadow-lg shadow-rose-200/30">
            <span className="text-xs font-bold">享</span>
          </div>
          <div>
            <h2 className="text-[15px] font-bold text-gray-800 dark:text-gray-100 tracking-tight">享聊</h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
              <p className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                {user.display_name || user.username}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 新对话 */}
      <div className="px-4 pt-4">
        <button onClick={onNew}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-brand hover:bg-brand-dark text-white rounded-2xl text-[13px] font-semibold transition-all shadow-sm active:scale-95 cursor-pointer">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          开启新对话
        </button>
      </div>

      {/* ── 角色栏 ── */}
      <div className="px-3 pt-4 pb-2">
        <div className="flex items-center justify-between px-1 mb-2">
          <p className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">角色</p>
          <button onClick={() => setShowCreate(!showCreate)}
            className="p-1 text-gray-400 hover:text-brand rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition cursor-pointer">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        {/* 创建表单 */}
        {showCreate && (
          <div className="mb-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-2xl space-y-2 animate-in fade-in">
            <div className="flex items-center gap-2">
              <button onClick={() => {
                const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
                inp.onchange = (e) => { const f = e.target.files[0]; if (f) { setCharAvatarFile(f); setNewChar({ ...newChar, avatar_url: URL.createObjectURL(f) }); } };
                inp.click();
              }} className="shrink-0">
                {charAvatarFile ? (
                  <img src={newChar.avatar_url} alt="" className="w-10 h-10 rounded-xl object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-lg cursor-pointer hover:bg-gray-300 transition">{newChar.avatar_url}</div>
                )}
              </button>
              <input className="flex-1 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-xl px-3 py-2 text-sm" placeholder="角色名称" value={newChar.name}
                onChange={e => setNewChar({ ...newChar, name: e.target.value })} />
            </div>
            <textarea className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-xl px-3 py-2 text-xs" rows="2"
              placeholder="系统提示词" value={newChar.system_prompt}
              onChange={e => setNewChar({ ...newChar, system_prompt: e.target.value })} />
            <div className="flex gap-2">
              <button onClick={() => setShowCreate(false)} className="flex-1 py-1.5 text-xs text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg cursor-pointer">取消</button>
              <button onClick={handleCreateChar} className="flex-1 py-1.5 text-xs bg-brand text-white rounded-lg hover:bg-brand-dark cursor-pointer">创建</button>
            </div>
          </div>
        )}

        {/* 角色列表 */}
        <div className="space-y-0.5">
          {characters.map(ch => (
            <button key={ch.id}
              onClick={() => onSelectChar?.(ch.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition cursor-pointer group/char
                ${activeCharId === ch.id ? 'bg-brand/10 dark:bg-brand/20' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
              {ch.avatar_url?.startsWith('/') ? (
                <img src={ch.avatar_url} alt="" className="w-7 h-7 rounded-lg object-cover" />
              ) : (
                <span className="text-lg shrink-0">{ch.avatar_url || '🥰'}</span>
              )}
              <span className="text-[13px] text-gray-700 dark:text-gray-300 truncate font-medium flex-1">{ch.name}</span>
              <button onClick={(e) => { e.stopPropagation(); navigate('/settings'); setTimeout(() => {
                const evt = new CustomEvent('switchTab', { detail: 'characters' }); window.dispatchEvent(evt);
              }, 100); }}
                className="opacity-0 group-hover/char:opacity-100 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-400 cursor-pointer shrink-0"
                title="编辑此角色">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            </button>
          ))}
          <button onClick={() => onSelectChar?.(null)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition cursor-pointer
              ${!activeCharId ? 'bg-brand/10 dark:bg-brand/20' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
            <span className="text-lg">🥰</span>
            <span className="text-[13px] text-gray-500 dark:text-gray-400">默认</span>
          </button>
        </div>
      </div>

      {/* 历史会话 */}
      <div className="flex-1 overflow-y-auto chat-scroll px-3 py-2 space-y-1">
        <div className="flex items-center justify-between px-1 pb-2">
          <p className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">历史会话</p>
        </div>

        {/* 搜索框 */}
        <div className="relative mb-2">
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜索会话..."
            className="w-full bg-gray-100 dark:bg-gray-800 text-[12px] text-gray-600 dark:text-gray-300
              rounded-lg pl-8 pr-3 py-1.5 placeholder:text-gray-400 focus:outline-none focus:ring-1
              focus:ring-brand/30 transition"
          />
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {searchQuery && (
            <button onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* 置顶会话 */}
        {pinnedSessions.length > 0 && (
          <>
            <p className="px-1 pt-1 pb-1 text-[10px] font-semibold text-amber-500 dark:text-amber-400 uppercase tracking-wider">📌 置顶</p>
            {pinnedSessions.map((s) => (
              <SessionItem key={s.id} s={s} activeId={activeId} onSelect={onSelect}
                onPin={togglePin} onInherit={inheritSession} onDelete={handleDelete}
                isPinned={true} />
            ))}
          </>
        )}

        {/* 普通会话 */}
        {pinnedSessions.length > 0 && normalSessions.length > 0 && (
          <p className="px-1 pt-2 pb-1 text-[10px] font-semibold text-gray-300 dark:text-gray-600 uppercase tracking-wider">最近</p>
        )}
        {normalSessions.map((s) => (
          <SessionItem key={s.id} s={s} activeId={activeId} onSelect={onSelect}
            onPin={togglePin} onInherit={inheritSession} onDelete={handleDelete}
            isPinned={false} />
        ))}

        {/* 无搜索结果 */}
        {filteredSessions.length === 0 && (
          <div className="text-center py-8 text-[12px] text-gray-400">
            {searchQuery ? '未找到匹配的会话' : '暂无历史会话'}
          </div>
        )}
      </div>

      {/* 底部 */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50 space-y-1.5">
        <button onClick={() => navigate('/knowledge')}
          className="flex items-center gap-2.5 w-full px-3 py-2 text-[13px] font-semibold text-gray-500 dark:text-gray-400 hover:text-brand rounded-xl transition cursor-pointer">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
          知识库
        </button>
        <button onClick={() => navigate('/memory')}
          className="flex items-center gap-2.5 w-full px-3 py-2 text-[13px] font-semibold text-gray-500 dark:text-gray-400 hover:text-brand rounded-xl transition cursor-pointer">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
          AI 记忆
        </button>
        <button onClick={() => { localStorage.removeItem('token'); localStorage.removeItem('user'); navigate('/login'); }}
          className="flex items-center gap-2.5 w-full px-3 py-2 text-[13px] font-semibold text-gray-500 dark:text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition cursor-pointer">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
          退出登录
        </button>
      </div>
    </div>
  );
}

// 会话列表项组件
function SessionItem({ s, activeId, onSelect, onPin, onInherit, onDelete, isPinned }) {
  return (
    <div onClick={() => onSelect(s.id)}
      className={`group flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all
        ${activeId === s.id
          ? 'bg-brand/5 dark:bg-brand/20 text-brand'
          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
      <div className="flex items-center gap-2.5 min-w-0">
        <svg className={`w-3.5 h-3.5 shrink-0 ${activeId === s.id ? 'text-brand' : 'text-gray-300 dark:text-gray-600'}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
        <div className="flex-1 min-w-0">
          <span className={`text-[13px] truncate block ${activeId === s.id ? 'font-semibold' : 'font-medium'}`}>{s.title}</span>
          {s.total_tokens_used > 0 && (
            <span className="text-[9px] text-gray-400 dark:text-gray-600">
              {(s.total_tokens_used / 1000).toFixed(0)}K tokens · ~¥{((s.total_tokens_used / 1_000_000) * 2).toFixed(2)}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <button onClick={(e) => onPin(e, s.id)}
          className={`p-1 rounded-md transition cursor-pointer ${isPinned ? 'opacity-100 text-amber-500' : 'opacity-0 group-hover:opacity-100 hover:bg-amber-50 dark:hover:bg-amber-900/20 text-gray-400 hover:text-amber-500'}`}
          title={isPinned ? '取消置顶' : '置顶'}>
          <svg className="w-3.5 h-3.5" fill={isPinned ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
        </button>
        <button onClick={async (e) => {
          e.stopPropagation();
          try {
            const res = await onInherit(s.id);
            onSelect(res.new_session_id);
          } catch (err) { console.error(err); }
        }}
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-brand/10 text-gray-400 hover:text-brand rounded-md transition cursor-pointer"
          title="继承此对话">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
        </button>
        <button onClick={(e) => onDelete(e, s.id)}
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 rounded-md transition cursor-pointer">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
}
