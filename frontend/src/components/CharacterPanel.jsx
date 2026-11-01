import { useState, useEffect } from 'react';
import { listCharacters, createCharacter, deleteCharacter, setDefaultCharacter } from '../utils/api';

export default function CharacterPanel({ activeId, onSelect, onClose }) {
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newChar, setNewChar] = useState({ name: '', avatar_url: '🥰', description: '', system_prompt: '你是一个友好的AI助手。简洁准确地回答问题。' });

  const load = async () => {
    try {
      const data = await listCharacters(true);
      // 排序：内置角色在前，用户自定义角色按时间
      setCharacters(data);
    } catch (e) { console.error('加载角色失败', e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!newChar.name.trim()) return;
    try {
      const created = await createCharacter(newChar);
      setShowCreate(false);
      setNewChar({ name: '', avatar_url: '🥰', description: '', system_prompt: '你是一个友好的AI助手。简洁准确地回答问题。' });
      await load();
      onSelect(created.id);
    } catch (e) {
      console.error('创建角色失败:', e);
    }
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!confirm('确定删除这个角色？')) return;
    try {
      await deleteCharacter(id);
      await load();
      if (activeId === id) onSelect(null);
    } catch (err) { console.error('删除失败:', err); }
  };

  const builtin = characters.filter(c => c.is_builtin);
  const custom = characters.filter(c => !c.is_builtin);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-4 w-[300px] z-50 max-h-[460px] overflow-y-auto">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">选择角色</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {loading ? (
        <div className="text-center py-6 text-gray-400 text-sm">加载中...</div>
      ) : (
        <>
          {/* 创建新角色按钮 */}
          <button onClick={() => setShowCreate(!showCreate)}
            className="w-full flex items-center justify-center gap-2 py-2 mb-3 border-2 border-dashed
              border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-500 dark:text-gray-400
              hover:border-brand hover:text-brand dark:hover:border-brand transition cursor-pointer">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            创建新角色
          </button>

          {/* 创建表单 */}
          {showCreate && (
            <div className="mb-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-xl space-y-2 animate-in fade-in">
              <input
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 rounded-lg px-3 py-1.5 text-sm"
                placeholder="角色名称 *" value={newChar.name}
                onChange={e => setNewChar({ ...newChar, name: e.target.value })} />
              <input
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 rounded-lg px-3 py-1.5 text-sm"
                placeholder="头像 emoji" value={newChar.avatar_url}
                onChange={e => setNewChar({ ...newChar, avatar_url: e.target.value })} />
              <input
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 rounded-lg px-3 py-1.5 text-sm"
                placeholder="简介（选填）" value={newChar.description}
                onChange={e => setNewChar({ ...newChar, description: e.target.value })} />
              <textarea
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 rounded-lg px-3 py-1.5 text-sm"
                rows="2" placeholder="系统提示词" value={newChar.system_prompt}
                onChange={e => setNewChar({ ...newChar, system_prompt: e.target.value })} />
              <div className="flex gap-2">
                <button onClick={() => setShowCreate(false)}
                  className="flex-1 py-1.5 text-xs text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg cursor-pointer">取消</button>
                <button onClick={handleCreate}
                  className="flex-1 py-1.5 text-xs bg-brand text-white rounded-lg hover:bg-brand-dark cursor-pointer">保存</button>
              </div>
            </div>
          )}

          {/* 自定义角色（可删除） */}
          {custom.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-1.5 font-medium uppercase tracking-wider">我的角色</p>
              <div className="space-y-1">
                {custom.map(ch => (
                  <div key={ch.id}
                    onClick={() => { onSelect(ch.id); onClose(); }}
                    className={`group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition cursor-pointer
                      ${ch.id === activeId ? 'bg-brand/10 dark:bg-brand/20 border border-brand/30' : 'hover:bg-gray-50 dark:hover:bg-gray-700 border border-transparent'}`}>
                    <span className="text-2xl">{ch.avatar_url || '🥰'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{ch.name}</p>
                      {ch.description && <p className="text-[11px] text-gray-400 truncate">{ch.description}</p>}
                    </div>
                    <button onClick={(e) => handleDelete(e, ch.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 dark:hover:bg-red-900/30 rounded text-gray-400 hover:text-red-500 cursor-pointer transition">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                    {ch.id === activeId && (
                      <svg className="w-5 h-5 text-brand shrink-0" fill="currentColor" viewBox="0 0 24 24">
                        <path fillRule="evenodd" d="M20.293 5.293a1 1 0 00-1.414 0L10 14.086l-3.293-3.293a1 1 0 10-1.414 1.414l4 4a1 1 0 001.414 0l9.5-9.5a1 1 0 000-1.414z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 内置角色 */}
          <div>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-1.5 font-medium uppercase tracking-wider">内置角色</p>
            <div className="space-y-1">
              {builtin.map(ch => (
                <button key={ch.id}
                  onClick={() => { onSelect(ch.id); onClose(); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition cursor-pointer
                    ${ch.id === activeId ? 'bg-brand/10 dark:bg-brand/20 border border-brand/30' : 'hover:bg-gray-50 dark:hover:bg-gray-700 border border-transparent'}`}>
                  <span className="text-2xl">{ch.avatar_url || '🥰'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{ch.name}</p>
                    {ch.description && <p className="text-[11px] text-gray-400 truncate">{ch.description}</p>}
                  </div>
                  {ch.id === activeId && (
                    <svg className="w-5 h-5 text-brand shrink-0" fill="currentColor" viewBox="0 0 24 24">
                      <path fillRule="evenodd" d="M20.293 5.293a1 1 0 00-1.414 0L10 14.086l-3.293-3.293a1 1 0 10-1.414 1.414l4 4a1 1 0 001.414 0l9.5-9.5a1 1 0 000-1.414z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
