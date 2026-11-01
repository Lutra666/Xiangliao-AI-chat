import { useState } from 'react';
import { Card, Button, Input, Textarea, Avatar } from '../../../components/ui';
import {
  useCharacters,
  useCreateCharacter,
  useUpdateCharacter,
  useDeleteCharacter,
  useSetDefaultCharacter,
  uploadCharacterAvatar,
} from '../../../hooks';
import { cn } from '../../../lib/cn';

export default function CharactersTab() {
  const { data: characters = [] } = useCharacters(false);
  const createMut = useCreateCharacter();
  const updateMut = useUpdateCharacter();
  const deleteMut = useDeleteCharacter();
  const setDefaultMut = useSetDefaultCharacter();

  const [newChar, setNewChar] = useState({
    name: '',
    avatar_url: '🥰',
    description: '',
    system_prompt: '你是一个友好的AI助手。',
  });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editAvatarFile, setEditAvatarFile] = useState(null);

  const handleCreate = async () => {
    if (!newChar.name.trim()) return;
    try {
      await createMut.mutateAsync(newChar);
      setNewChar({ name: '', avatar_url: '🥰', description: '', system_prompt: '你是一个友好的AI助手。' });
    } catch (e) { console.error(e); }
  };

  const handleDelete = (id) => {
    if (!confirm('删除这个角色？')) return;
    deleteMut.mutate(id);
  };

  const startEdit = (ch) => {
    setEditingId(ch.id);
    setEditForm({ ...ch, parameters: ch.parameters || {} });
    setEditAvatarFile(null);
  };

  const saveEdit = async () => {
    const { id, is_builtin, created_at, updated_at, user_id, ...data } = editForm;
    let avatar = editForm.avatar_url;
    if (editAvatarFile) {
      try {
        const d = await uploadCharacterAvatar(editAvatarFile);
        avatar = d.avatar_url;
      } catch {
        alert('头像上传失败，将使用原头像');
        return;
      }
    }
    try {
      await updateMut.mutateAsync({ id, data: { ...data, avatar_url: avatar } });
      setEditingId(null);
    } catch (e) { console.error(e); }
  };

  return (
    <Card className="p-6">
      {/* 创建角色 */}
      <h2 className="text-sm font-semibold text-text-subtle uppercase tracking-wider mb-4">创建角色</h2>
      <div className="p-4 bg-surface-hover rounded-xl space-y-2 mb-6">
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="角色名" value={newChar.name} onChange={(e) => setNewChar({ ...newChar, name: e.target.value })} />
          <Input placeholder="头像 emoji" value={newChar.avatar_url} onChange={(e) => setNewChar({ ...newChar, avatar_url: e.target.value })} />
        </div>
        <Input placeholder="简介" value={newChar.description} onChange={(e) => setNewChar({ ...newChar, description: e.target.value })} />
        <Textarea rows={3} placeholder="系统提示词" value={newChar.system_prompt} onChange={(e) => setNewChar({ ...newChar, system_prompt: e.target.value })} />
        <Button variant="primary" size="sm" onClick={handleCreate} loading={createMut.isPending}>保存角色</Button>
      </div>

      {/* 角色列表 */}
      <h2 className="text-sm font-semibold text-text-subtle uppercase tracking-wider mb-4">
        我的角色 ({characters.length})
      </h2>
      <div className="space-y-3">
        {characters.map((ch) => (
          <div key={ch.id} className="bg-surface-hover rounded-xl overflow-hidden">
            {editingId === ch.id ? (
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      const inp = document.createElement('input');
                      inp.type = 'file';
                      inp.accept = 'image/*';
                      inp.onchange = (e) => {
                        const f = e.target.files[0];
                        if (f) {
                          setEditAvatarFile(f);
                          setEditForm({ ...editForm, avatar_url: URL.createObjectURL(f) });
                        }
                      };
                      inp.click();
                    }}
                  >
                    {editForm.avatar_url?.startsWith('blob:') || editAvatarFile || editForm.avatar_url?.startsWith('/') ? (
                      <img src={editForm.avatar_url} alt="" className="w-12 h-12 rounded-xl object-cover" />
                    ) : (
                      <Avatar emoji={editForm.avatar_url || '🥰'} size="md" gradient="gray" className="cursor-pointer" />
                    )}
                  </button>
                  <Input
                    className="flex-1 font-medium"
                    value={editForm.name || ''}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    placeholder="角色名"
                  />
                </div>
                <Input value={editForm.avatar_url || ''} onChange={(e) => setEditForm({ ...editForm, avatar_url: e.target.value })} placeholder="头像 URL/emoji" />
                <Input value={editForm.description || ''} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} placeholder="简介" />
                <Textarea rows={4} value={editForm.system_prompt || ''} onChange={(e) => setEditForm({ ...editForm, system_prompt: e.target.value })} placeholder="系统提示词" />
                <div className="grid grid-cols-3 gap-2">
                  {['temperature', 'top_p', 'max_tokens'].map((k) => (
                    <div key={k}>
                      <label className="text-[10px] text-text-subtle">{k}</label>
                      <Input
                        type="number"
                        step="0.01"
                        className="text-xs"
                        value={editForm.parameters?.[k] ?? ''}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            parameters: { ...editForm.parameters, [k]: parseFloat(e.target.value) || 0 },
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 text-xs text-text-muted">
                    <input type="checkbox" checked={!!editForm.is_default} onChange={(e) => setEditForm({ ...editForm, is_default: e.target.checked })} className="rounded" />
                    默认角色
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-text-muted">
                    <input type="checkbox" checked={!!editForm.is_public} onChange={(e) => setEditForm({ ...editForm, is_public: e.target.checked })} className="rounded" />
                    公开分享
                  </label>
                </div>
                <div className="flex gap-2">
                  <Button variant="primary" size="sm" onClick={saveEdit} loading={updateMut.isPending}>保存</Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>取消</Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-3 group">
                {ch.avatar_url?.startsWith('/') ? (
                  <img src={ch.avatar_url} alt="" className="w-10 h-10 rounded-xl object-cover shrink-0" />
                ) : (
                  <span className="text-3xl shrink-0">{ch.avatar_url || '🥰'}</span>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-text">{ch.name}</p>
                    {ch.is_default && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-brand-soft text-brand rounded-full">默认</span>
                    )}
                  </div>
                  {ch.description && <p className="text-[11px] text-text-subtle">{ch.description}</p>}
                  <p className="text-[11px] text-text-subtle truncate mt-0.5">{ch.system_prompt?.slice(0, 60)}...</p>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => startEdit(ch)} className="px-2 py-1 text-[10px] text-brand hover:bg-brand-soft rounded cursor-pointer font-medium">编辑</button>
                  {!ch.is_default && (
                    <button onClick={() => setDefaultMut.mutate(ch.id)} className="px-2 py-1 text-[10px] text-brand hover:bg-brand-soft rounded cursor-pointer">默认</button>
                  )}
                  <button onClick={() => handleDelete(ch.id)} className="px-2 py-1 text-[10px] text-danger hover:bg-danger-soft rounded cursor-pointer">删除</button>
                </div>
              </div>
            )}
          </div>
        ))}
        {characters.length === 0 && (
          <p className="text-center text-sm text-text-subtle py-8">还没有自定义角色</p>
        )}
      </div>
    </Card>
  );
}
