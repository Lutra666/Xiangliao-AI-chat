import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2, Brain, Layers, Plus } from 'lucide-react';
import { cn } from '../lib/cn';
import { Button, IconButton, Card, Input, Spinner } from '../components/ui';
import { useMemories, useCreateMemory, useDeleteMemory, useUpdateMemory, useConsolidateMemories } from '../hooks';
import { useChatStore } from '../store/useChatStore';

const CAT_ICONS = { preference: '❤️', fact: '📋', plan: '📅', background: '📖' };
const CAT_NAMES = { preference: '偏好', fact: '事实', plan: '计划', background: '背景' };
const CATS = ['', 'preference', 'fact', 'plan', 'background'];

export default function MemoryPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState('fact');

  const sessionId = useChatStore((s) => s.sessionId);
  const sessionTitle = useChatStore((s) => s.sessionTitle);
  const memoryPausedAfterRecall = useChatStore((s) => s.memoryPausedAfterRecall);
  const { data: memories = [], isLoading, isError } = useMemories(sessionId, filter || null);
  const deleteMem = useDeleteMemory();
  const createMem = useCreateMemory();
  const updateMem = useUpdateMemory();
  const consolidate = useConsolidateMemories();

  const handleEditSave = (id, data) => {
    updateMem.mutate(
      { id, data },
      {
        onSuccess: () => setEditing(null),
        onError: () => alert('保存记忆失败，请重试'),
      }
    );
  };

  return (
    <div className="min-h-screen bg-bg transition-colors duration-slower">
      {/* 顶栏 */}
      <header className="bg-surface/95 backdrop-blur-xl border-b border-border sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <IconButton label="返回" variant="ghost" onClick={() => navigate('/chat')}>
            <ArrowLeft className="w-5 h-5" />
          </IconButton>
          <h1 className="text-lg font-semibold text-text-header">会话记忆</h1>
          <Button
            variant="soft"
            size="sm"
            onClick={() => consolidate.mutate(sessionId, { onError: () => alert('整理记忆失败，请重试') })}
            disabled={!sessionId}
            loading={consolidate.isPending}
          >
            <Layers className="w-3.5 h-3.5" />
            整理
          </Button>
        </div>
      </header>

      <p className="max-w-2xl mx-auto px-4 pt-4 text-sm text-text-muted">
        {sessionId ? `当前会话：${sessionTitle || '未命名会话'}` : '请先选择一个会话，再查看它的记忆。'}
      </p>
      {memoryPausedAfterRecall && <p className="max-w-2xl mx-auto px-4 pt-2 text-sm text-text-muted">
        本会话的旧记忆可能缺少来源；系统只会使用来源可确认且未失效的记忆。新记忆会记录来源。
      </p>}
      {sessionId && (
        <form className="max-w-2xl mx-auto px-4 pt-4 flex flex-col gap-2" onSubmit={(event) => {
          event.preventDefault();
          const content = newContent.trim();
          if (!content || createMem.isPending) return;
          createMem.mutate({ sessionId, content, category: newCategory }, {
            onSuccess: () => setNewContent(''),
            onError: (error) => alert(error.message || '添加记忆失败，请重试'),
          });
        }}>
          <label htmlFor="new-memory" className="text-sm font-medium text-text">添加这段故事的记忆</label>
          <textarea id="new-memory" value={newContent} onChange={(event) => setNewContent(event.target.value)}
            maxLength={5000} rows={2} placeholder="例如：我们约好下次一起去看海"
            className="w-full rounded-xl border border-border bg-surface p-3 text-sm text-text resize-y" />
          <div className="flex items-center justify-between gap-2">
            <select aria-label="记忆分类" value={newCategory} onChange={(event) => setNewCategory(event.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text">
              {Object.entries(CAT_NAMES).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
            </select>
            <Button type="submit" variant="primary" size="sm" loading={createMem.isPending} disabled={!newContent.trim()}>
              <Plus className="w-3.5 h-3.5" /> 添加记忆
            </Button>
          </div>
        </form>
      )}
      {/* 分类筛选 */}
      <div className="max-w-2xl mx-auto px-4 py-4 flex gap-2 overflow-x-auto scrollbar-hide">
        {CATS.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition cursor-pointer',
              filter === cat
                ? 'bg-brand text-brand-on shadow-sm'
                : 'bg-surface text-text-muted border border-border hover:bg-surface-hover'
            )}
          >
            {cat ? `${CAT_ICONS[cat]} ${CAT_NAMES[cat]}` : '全部'}
          </button>
        ))}
      </div>

      {/* 记忆列表 */}
      <div className="max-w-2xl mx-auto px-4 pb-10">
        {sessionId && isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : isError ? (
          <p className="text-center py-12 text-danger">加载记忆失败，请返回后重试。</p>
        ) : memories.length === 0 ? (
          <div className="text-center py-12 animate-in fade-in">
            <Brain className="w-16 h-16 mx-auto mb-4 text-text-subtle" />
            <h3 className="text-lg font-medium text-text-muted">暂无记忆</h3>
            <p className="text-sm text-text-subtle mt-2">
              {!sessionId ? '选择会话后即可查看' : filter ? '该分类下没有记忆' : 'AI 会自动从当前会话中提取记忆'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {memories.map((mem) => (
              <Card key={mem.id} className="p-4 group animate-in fade-in">
                {editing === mem.id ? (
                  <div className="space-y-2">
                    <Input
                      defaultValue={mem.content}
                      onChange={(e) => setEditContent(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleEditSave(mem.id, { content: e.target.value });
                      }}
                      autoFocus
                    />
                    <div className="flex gap-2 items-center">
                      <select
                        className="text-xs border border-border rounded-md px-2 py-1 bg-surface text-text"
                        defaultValue={mem.category}
                        onChange={(e) => handleEditSave(mem.id, { category: e.target.value })}
                      >
                        {Object.entries(CAT_NAMES).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => setEditing(null)}
                        className="text-xs text-text-subtle hover:text-text cursor-pointer"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start gap-3">
                      <span className="text-xl mt-0.5">{CAT_ICONS[mem.category] || '📋'}</span>
                      <p className="text-sm text-text flex-1">{mem.content}</p>
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <IconButton
                          label="编辑"
                          size="iconSm"
                          variant="ghost"
                          onClick={() => setEditing(mem.id)}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </IconButton>
                        <IconButton
                          label="删除"
                          size="iconSm"
                          variant="ghost"
                          className="hover:text-danger hover:bg-danger-soft"
                          onClick={() => deleteMem.mutate(mem.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </IconButton>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-2 ml-8">
                      <span className="text-[10px] text-text-subtle">{!mem.source_known ? '来源未知' : mem.source_message_ids?.length ? `来自 ${mem.source_message_ids.length} 条消息` : '手动添加'}{mem.usable ? '' : ' · 已暂停使用'}</span>
                      <span className="text-[10px] px-2 py-0.5 bg-surface-hover rounded-full text-text-muted">
                        {CAT_NAMES[mem.category]}
                      </span>
                      <div className="flex items-center gap-1.5 text-[10px] text-text-subtle">
                        <span>重要度</span>
                        <div className="w-12 h-1.5 bg-surface-active rounded-full overflow-hidden">
                          <div
                            className="h-full bg-brand rounded-full"
                            style={{ width: `${(mem.importance || 0) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
