import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { cn } from '../../../lib/cn';

export default function CodeBlock({ code, lang }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const text = code.replace(/\n$/, '');
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const fallbackCopy = (text) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch {}
    document.body.removeChild(ta);
  };

  return (
    <div className="code-block-wrapper my-2 rounded-xl overflow-hidden border border-border bg-bg-elevated">
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface-hover border-b border-border">
        {lang ? (
          <span className="text-[10px] text-text-subtle select-none font-mono">{lang}</span>
        ) : (
          <span className="text-[10px] text-text-subtle select-none">code</span>
        )}
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 text-[11px] text-text-subtle hover:text-brand transition cursor-pointer"
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre className="px-3 py-2 overflow-x-auto text-sm">
        <code className={cn(lang && `language-${lang}`)}>{code.replace(/\n$/, '')}</code>
      </pre>
    </div>
  );
}
