import { useState } from 'react';

const EMOJIS = [
  '😀','😂','🤣','😊','😍','🥰','😘','😜','🤔','🤗',
  '👍','👎','👏','🙌','💪','✌️','🤝','❤️','🔥','⭐',
  '🎉','🎊','🎈','✨','💡','📌','💯','✅','❌','⚡',
  '🐱','🐶','🦊','🐼','🌻','🌸','🌈','🍕','☕','🎵',
];

export default function EmojiPicker({ onSelect, onClose }) {
  const [recent, setRecent] = useState(() => {
    try { return JSON.parse(localStorage.getItem('recent_emojis') || '[]'); }
    catch { return []; }
  });

  const handlePick = (emoji) => {
    const updated = [emoji, ...recent.filter(e => e !== emoji)].slice(0, 12);
    setRecent(updated);
    localStorage.setItem('recent_emojis', JSON.stringify(updated));
    onSelect(emoji);
  };

  return (
    <div className="absolute bottom-full left-0 mb-2 bg-white rounded-xl shadow-xl border border-gray-200 p-3 w-[280px] z-50">
      {recent.length > 0 && (
        <div className="mb-2">
          <p className="text-[10px] text-gray-400 mb-1.5">最近使用</p>
          <div className="flex flex-wrap gap-1">
            {recent.map((e, i) => (
              <button key={i} onClick={() => handlePick(e)} className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-lg text-lg cursor-pointer">{e}</button>
            ))}
          </div>
        </div>
      )}
      <p className="text-[10px] text-gray-400 mb-1.5">全部表情</p>
      <div className="flex flex-wrap gap-1 max-h-[120px] overflow-y-auto">
        {EMOJIS.map((e, i) => (
          <button key={i} onClick={() => handlePick(e)} className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-lg text-lg cursor-pointer">{e}</button>
        ))}
      </div>
    </div>
  );
}
