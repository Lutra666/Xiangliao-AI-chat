import { ArrowDown } from 'lucide-react';
import { cn } from '../../../lib/cn';

export default function NewMessageToast({ show, onClick }) {
  if (!show) return null;
  return (
    <button
      onClick={onClick}
      className={cn(
        'fixed left-1/2 -translate-x-1/2 bottom-32 z-20',
        'inline-flex items-center gap-1.5 px-4 py-1.5',
        'bg-brand text-brand-on text-xs font-medium rounded-full',
        'shadow-lg shadow-brand/30 hover:bg-brand-hover',
        'transition-all cursor-pointer animate-in fade-in slide-in-from-bottom-2'
      )}
    >
      <ArrowDown className="w-3.5 h-3.5" />
      新消息
    </button>
  );
}
