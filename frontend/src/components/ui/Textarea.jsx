import { forwardRef, useEffect, useRef } from 'react';
import { cn } from '../../lib/cn';

export const Textarea = forwardRef(function Textarea(
  {
    className,
    invalid = false,
    autoResize = false,
    maxAutoHeight = 200,
    ...props
  },
  ref
) {
  const innerRef = useRef(null);

  useEffect(() => {
    if (!autoResize) return;
    const el = innerRef.current;
    if (!el) return;
    const adjust = () => {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, maxAutoHeight) + 'px';
    };
    adjust();
    el.addEventListener('input', adjust);
    return () => el.removeEventListener('input', adjust);
  }, [autoResize, maxAutoHeight, props.value]);

  return (
    <textarea
      ref={(node) => {
        innerRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      }}
      className={cn(
        'w-full bg-surface border border-border text-text placeholder:text-text-subtle shadow-xs',
        'rounded-md px-3.5 py-2.5 text-sm leading-relaxed',
        'transition-all duration-fast ease-out',
        'hover:border-border-strong',
        'focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20',
        'disabled:opacity-50 disabled:bg-surface-hover',
        'resize-none',
        invalid && 'border-danger focus:border-danger focus:ring-danger/20',
        className
      )}
      {...props}
    />
  );
});
