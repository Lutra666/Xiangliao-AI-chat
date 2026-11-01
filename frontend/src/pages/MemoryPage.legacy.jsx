import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { listMemories, deleteMemory, updateMemory, consolidateMemories } from '../utils/api';

const CAT_ICONS = { preference: '❤️', fact: '📋', plan: '📅', background: '📖' };
const CAT_NAMES = { preference: '偏好', fact: '事实', plan: '计划', background: '背景' };

export default function MemoryPage() {
  const navigate = useNavigate();
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState(null);

  const load = async () => {
    try {
      const data = await listMemories(filter || null);
      setMemories(data);
    } catch (e) {
      console.error('load memories failed', e);
    } finally {
      setLoading(false);
    }
  };

  // filter 切换时防竞态：快速切换分类时丢弃过期的请求结果
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listMemories(filter || null).then(data => {
      if (!cancelled) setMemories(data);
    }).catch(e => {
      if (!cancelled) console.error('load memories failed', e);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [filter]);

  const handleDelete = async (id) => {
    try {
      await deleteMemory(id);
      setMemories(prev => prev.filter(m => m.id !== id));
    } catch (e) { console.error(e); }
  };

  const handleConsolidate = async () => {
    try {
      const { consolidated } = await consolidateMemories();
      if (consolidated > 0) load();
    } catch (e) { console.error(e); }
  };

  const handleEditSave = async (id, data) => {
    try {
      await updateMemory(id, data);
      setEditing(null);
      load();
    } catch (e) {
      console.error('保存记忆失败', e);
      alert('保存记忆失败，请重试');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors">
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <button onClick={() => navigate('/chat')} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition cursor-pointer">
            <svg className="w-6 h-6 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-100">AI memory</h1>
          <button onClick={handleConsolidate} className="text-xs text-brand hover:underline cursor-pointer">consolidate</button>
        </div>
      </header>

      {/* filter bar */}
      <div className="max-w-2xl mx-auto px-4 py-4 flex gap-2 overflow-x-auto">
        {['', 'preference', 'fact', 'plan', 'background'].map(cat => (
          <button key={cat} onClick={() => setFilter(cat)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition cursor-pointer
              ${filter === cat ? 'bg-brand text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
            {cat ? CAT_NAMES[cat] : 'all'}
          </button>
        ))}
      </div>

      {/* memory list */}
      <div className="max-w-2xl mx-auto px-4 pb-10">
        {loading ? (
          <div className="text-center py-12 text-gray-400 dark:text-gray-500">loading...</div>
        ) : memories.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-5xl mb-4">🧠</div>
            <h3 className="text-lg font-medium text-gray-600 dark:text-gray-300">no memories</h3>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
              {filter ? 'no memories in this category' : 'AI automatically extracts memories from conversations'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {memories.map(mem => (
              <div key={mem.id} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm dark:shadow-gray-900/30 border border-gray-100 dark:border-gray-700 group">
                {editing === mem.id ? (
                  <div className="space-y-2">
                    <input className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 rounded-lg px-3 py-2 text-sm" defaultValue={mem.content}
                      onKeyDown={e => { if (e.key === 'Enter') handleEditSave(mem.id, { content: e.target.value }); }} />
                    <div className="flex gap-2">
                      <select className="text-xs border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 rounded px-2 py-1" defaultValue={mem.category}
                        onChange={e => handleEditSave(mem.id, { category: e.target.value })}>
                        {Object.entries(CAT_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      <button onClick={() => setEditing(null)} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer">cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start gap-3">
                      <span className="text-xl mt-0.5">{CAT_ICONS[mem.category] || '📋'}</span>
                      <p className="text-sm text-gray-800 dark:text-gray-200 flex-1">{mem.content}</p>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                        <button onClick={() => setEditing(mem.id)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer">
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button onClick={() => handleDelete(mem.id)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer">
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-2 ml-8">
                      <span className="text-[10px] px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-full text-gray-500 dark:text-gray-400">{CAT_NAMES[mem.category]}</span>
                      <div className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500">
                        <span>importance</span>
                        <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                          <div className="h-full bg-brand rounded-full" style={{ width: `${(mem.importance || 0) * 100}%` }} />
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
