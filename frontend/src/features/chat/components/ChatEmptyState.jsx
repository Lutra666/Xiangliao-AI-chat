import { Sparkles, ArrowUpRight } from 'lucide-react';
import { getTimeSuggestions, getGreeting } from '../constants';
import { useChatStore } from '../../../store/useChatStore';

export default function ChatEmptyState({ onQuickSend }) {
  const character = useChatStore((s) => s.character);
  const suggestions = getTimeSuggestions();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-2 pb-8 pt-10 sm:px-6 md:pt-20">
      <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft text-brand shadow-sm">
        {character?.avatar_url ? <span className="text-3xl">{character.avatar_url}</span> : <Sparkles className="h-7 w-7" />}
      </div>
      <p className="mb-3 text-xs font-semibold tracking-[0.18em] text-brand">享聊 · 你的对话空间</p>
      <h2 className="text-3xl font-semibold leading-tight tracking-tight text-text-header sm:text-4xl">
        {getGreeting()}，<br className="sm:hidden" />{character ? `我是 ${character.name}` : '今天想聊些什么？'}
      </h2>
      <p className="mt-4 max-w-lg text-sm leading-7 text-text-muted sm:text-base">
        {character?.description || '无论是整理思路、探索新问题，还是随便聊聊，我都在这里陪你。'}
      </p>
      <div className="mt-12 flex items-center justify-between border-b border-border pb-3">
        <span className="text-xs font-semibold tracking-wider text-text-muted">从这里开始</span>
        <span className="text-xs text-text-subtle">选择一个话题，或直接输入</span>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {suggestions.map((s, i) => (
          <button key={`${s.text}-${i}`} type="button" onClick={() => onQuickSend?.(s.text)}
            className="group flex min-h-28 flex-col items-start justify-between rounded-2xl border border-border bg-surface p-4 text-left shadow-xs transition-all duration-normal hover:-translate-y-0.5 hover:border-border-brand hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
            <span className="flex w-full items-start justify-between"><span className="text-2xl" aria-hidden="true">{s.icon}</span><ArrowUpRight className="h-4 w-4 text-text-subtle transition-colors group-hover:text-brand" /></span>
            <span className="mt-4 text-sm font-medium leading-5 text-text-muted group-hover:text-text">{s.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
