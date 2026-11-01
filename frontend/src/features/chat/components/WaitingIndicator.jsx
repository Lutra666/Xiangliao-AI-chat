import { useChatStore } from '../../../store/useChatStore';

const STAGE_TEXT = {
  1: '思考中…',
  2: '正在组织语言…',
  3: '还在思考，内容较多请耐心等待…',
};

export default function WaitingIndicator() {
  const loading = useChatStore((s) => s.loading);
  const streaming = useChatStore((s) => s.streaming);
  const waitStage = useChatStore((s) => s.waitStage);

  if (!loading || streaming) return null;

  return (
    <div className="flex items-center gap-3 text-sm mb-6 message-in">
      <div className="flex gap-1 bg-brand-soft px-3 py-2 rounded-full border border-border-brand">
        <span
          className="w-1.5 h-1.5 bg-brand rounded-full animate-bounce"
          style={{ animationDelay: '0s' }}
        />
        <span
          className="w-1.5 h-1.5 bg-brand rounded-full animate-bounce"
          style={{ animationDelay: '0.1s' }}
        />
        <span
          className="w-1.5 h-1.5 bg-brand rounded-full animate-bounce"
          style={{ animationDelay: '0.2s' }}
        />
      </div>
      <span className="font-medium text-brand">{STAGE_TEXT[waitStage] || STAGE_TEXT[1]}</span>
    </div>
  );
}
