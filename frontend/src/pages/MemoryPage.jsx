import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2, Brain, Layers } from 'lucide-react';
import { cn } from '../lib/cn';
import { Button, IconButton, Card, Input, Spinner } from '../components/ui';
import { useMemories, useDeleteMemory, useUpdateMemory, useConsolidateMemories } from '../hooks';

const CAT_ICONS = { preference: '❤️', fact: '📋', plan: '📅', background: '📖' };
const CAT_NAMES = { preference: '偏好', fact: '事实', plan: '计划', background: '背景' };
const CATS = ['', 'preference', 'fact', 'plan', 'background'];

export default function MemoryPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState(null);
  const [editContent, setEditContent] = useState('');

  const { data: memories = [], isLoading } = useMemories(filter || null);
  const deleteMem = useDeleteMemory();
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
          <h1 className="text-lg font-semibold text-text-header">AI 记忆</h1>
          <Button
            variant="soft"
            size="sm"
            onClick={() => consolidate.mutate()}
            loading={consolidate.isPending}
          >
            <Layers className="w-3.5 h-3.5" />
            整理
          </Button>
        </div>
      </header>

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
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : memories.length === 0 ? (
          <div className="text-center py-12 animate-in fade-in">
            <Brain className="w-16 h-16 mx-auto mb-4 text-text-subtle" />
            <h3 className="text-lg font-medium text-text-muted">暂无记忆</h3>
            <p className="text-sm text-text-subtle mt-2">
              {filter ? '该分类下没有记忆' : 'AI 会自动从对话中提取记忆'}
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
