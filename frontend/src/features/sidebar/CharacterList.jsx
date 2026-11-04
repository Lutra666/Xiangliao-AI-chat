import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Button, Input, Textarea, Avatar, IconButton } from '../../components/ui';
import { useCharacters, useCreateCharacter, uploadCharacterAvatar } from '../../hooks/useCharacters';

const DEFAULT_PROMPT =
  '你是享聊，{{user_name}}的AI伙伴。请保持自然、有温度的交流，留意对方的话和情绪；在合适的剧情中加入动作与神态，不要每句都使用相同的描写。';

export default function CharacterList({ activeCharId, onSelectChar }) {
  const navigate = useNavigate();
  const { data: characters = [] } = useCharacters(false);
  const createChar = useCreateCharacter();
  const [showCreate, setShowCreate] = useState(false);
  const [newChar, setNewChar] = useState({
    name: '',
    avatar_url: '🥰',
    description: '',
    system_prompt: DEFAULT_PROMPT,
  });
  const [charAvatarFile, setCharAvatarFile] = useState(null);

  const handleCreate = async () => {
    if (!newChar.name.trim()) return;
    try {
      let avatar = newChar.avatar_url;
      if (charAvatarFile) {
        try {
          const d = await uploadCharacterAvatar(charAvatarFile);
          avatar = d.avatar_url;
        } catch {
          alert('头像上传失败，将使用默认头像');
          avatar = '🥰';
        }
      }
      await createChar.mutateAsync({ ...newChar, avatar_url: avatar });
      setNewChar({ name: '', avatar_url: '🥰', description: '', system_prompt: DEFAULT_PROMPT });
      setCharAvatarFile(null);
      setShowCreate(false);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="px-3 pt-4 pb-2">
      <div className="flex items-center justify-between px-1 mb-2">
        <p className="text-[11px] font-bold text-text-subtle uppercase tracking-widest">角色</p>
        <IconButton label="创建角色" size="iconSm" variant="ghost" onClick={() => setShowCreate(!showCreate)}>
          <Plus className="w-4 h-4" />
        </IconButton>
      </div>

      {showCreate && (
        <div className="mb-2 p-3 bg-surface-hover rounded-xl space-y-2 animate-in fade-in">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const inp = document.createElement('input');
                inp.type = 'file';
                inp.accept = 'image/*';
                inp.onchange = (e) => {
                  const f = e.target.files[0];
                  if (f) {
                    setCharAvatarFile(f);
                    setNewChar({ ...newChar, avatar_url: URL.createObjectURL(f) });
                  }
                };
                inp.click();
              }}
              className="shrink-0"
            >
              {charAvatarFile ? (
                <img src={newChar.avatar_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
              ) : (
                <Avatar emoji={newChar.avatar_url} size="sm" gradient="gray" className="cursor-pointer hover:opacity-80" />
              )}
            </button>
            <Input
              placeholder="角色名称"
              size="sm"
              value={newChar.name}
              onChange={(e) => setNewChar({ ...newChar, name: e.target.value })}
            />
          </div>
          <Textarea
            placeholder="系统提示词"
            rows={2}
            value={newChar.system_prompt}
            onChange={(e) => setNewChar({ ...newChar, system_prompt: e.target.value })}
            className="text-xs"
          />
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="flex-1" onClick={() => setShowCreate(false)}>
              取消
            </Button>
            <Button variant="primary" size="sm" className="flex-1" onClick={handleCreate} loading={createChar.isPending}>
              创建
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-0.5">
        {characters.map((ch) => (
          <button
            key={ch.id}
            onClick={() => onSelectChar?.(ch.id)}
            className={cn(
              'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition cursor-pointer group/char',
              activeCharId === ch.id ? 'bg-brand-soft' : 'hover:bg-surface-hover'
            )}
          >
            {ch.avatar_url?.startsWith('/') ? (
              <img src={ch.avatar_url} alt="" className="w-7 h-7 rounded-lg object-cover" />
            ) : (
              <span className="text-lg shrink-0">{ch.avatar_url || '🥰'}</span>
            )}
            <span
              className={cn(
                'text-[13px] truncate font-medium flex-1',
                activeCharId === ch.id ? 'text-brand' : 'text-text'
              )}
            >
              {ch.name}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigate('/settings');
                setTimeout(() => {
                  const evt = new CustomEvent('switchTab', { detail: 'characters' });
                  window.dispatchEvent(evt);
                }, 100);
              }}
              className="opacity-0 group-hover/char:opacity-100 p-1 hover:bg-surface-active rounded text-text-subtle cursor-pointer shrink-0"
              title="编辑此角色"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          </button>
        ))}
        <button
          onClick={() => onSelectChar?.(null)}
          className={cn(
            'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition cursor-pointer',
            !activeCharId ? 'bg-brand-soft' : 'hover:bg-surface-hover'
          )}
        >
          <span className="text-lg">🥰</span>
          <span className="text-[13px] text-text-muted">默认</span>
        </button>
      </div>
    </div>
  );
}
