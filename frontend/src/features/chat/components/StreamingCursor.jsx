import { useChatStore } from '../../../store/useChatStore';

export default function StreamingCursor() {
  const streaming = useChatStore((s) => s.streaming);
  if (!streaming) return null;

  return (
    <div className="text-[10px] text-brand ml-1 mb-4 flex items-center gap-2">
      <span className="w-1 h-1 bg-brand rounded-full animate-ping" />
      <span>输出中</span>
      <span
        className="inline-block w-2 h-3.5 bg-brand rounded-sm animate-pulse"
        style={{ animationDuration: '0.8s' }}
      />
    </div>
  );
}
