import { useEffect, useState } from 'react';
import { storyRequest } from '../../../utils/api';

export default function StoryPanel({ sessionId, onClose, onOpenMessage }) {
  const [summary, setSummary] = useState('');
  const [query, setQuery] = useState('');
  const [saved, setSaved] = useState(true);
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (sessionId) storyRequest(`/session/${sessionId}/story`).then((data) => setSummary(data.summary || '')).catch(() => setError('加载剧情小结失败'));
  }, [sessionId]);
  const search = async (event) => {
    event?.preventDefault(); setError(''); setBusy(true);
    try { setResults(await storyRequest(`/search?${new URLSearchParams({ q: query, saved: String(saved) })}`)); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  useEffect(() => { storyRequest('/search?saved=true').then(setResults).catch(() => setError('加载收藏失败')); }, []);
  const save = async () => {
    setError(''); setBusy(true);
    try { await storyRequest(`/session/${sessionId}/story`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ summary }) }); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return <div className="fixed inset-0 z-50 bg-overlay flex items-end sm:items-center justify-center" onClick={onClose}>
    <section role="dialog" aria-modal="true" aria-label="剧情与收藏" onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-xl max-h-[85dvh] overflow-y-auto bg-surface rounded-t-2xl sm:rounded-2xl p-5 shadow-xl">
      <div className="flex justify-between items-center mb-4"><h2 className="font-semibold text-text-header">剧情与收藏</h2><button onClick={onClose} aria-label="关闭">✕</button></div>
      <label className="block text-sm font-medium text-text mb-2" htmlFor="story-summary">当前会话的剧情小结</label>
      <textarea id="story-summary" value={summary} onChange={(e) => setSummary(e.target.value)} disabled={!sessionId} rows={3} maxLength={10000} placeholder={sessionId ? '记录人物关系、场景和约定…' : '先选择一个会话'} className="w-full rounded-xl border border-border bg-bg p-3 text-sm text-text" />
      <div className="mt-2 flex justify-end"><button disabled={!sessionId || busy} onClick={save} className="rounded-lg bg-brand px-4 py-2 text-xs text-brand-on disabled:opacity-50">保存小结</button></div>
      <form onSubmit={search} className="mt-5 flex gap-2"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索所有聊天内容或收藏备注" className="min-w-0 flex-1 rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text" /><button disabled={busy} className="rounded-lg bg-brand-soft px-4 text-sm text-brand">搜索</button></form>
      <label className="mt-3 flex items-center gap-2 text-xs text-text-muted"><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />只看收藏与剧情节点（更改后点搜索）</label>
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-3 space-y-2">{results.map((item) => <button key={item.id} onClick={() => onOpenMessage(item.session_id, item.id)} className="block w-full rounded-xl border border-border bg-bg p-3 text-left hover:border-border-brand">
        <span className="text-xs text-brand">{item.node ? '剧情节点 · ' : saved ? '收藏 · ' : '搜索结果 · '}{item.title || '未命名会话'}</span>
        <span className="mt-1 block line-clamp-2 text-sm text-text">{item.content}</span>
        {item.note && <span className="mt-1 block text-xs text-text-muted">{item.note}</span>}
      </button>)}{!results.length && <p className="py-4 text-center text-xs text-text-subtle">暂无结果</p>}</div>
    </section>
  </div>;
}
