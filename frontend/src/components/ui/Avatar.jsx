import { forwardRef } from 'react';
import { cn } from '../../lib/cn';

const SIZES = {
  xs: 'w-6 h-6 text-[10px] rounded-md',
  sm: 'w-8 h-8 text-xs rounded-lg',
  md: 'w-10 h-10 text-sm rounded-lg',
  lg: 'w-12 h-12 text-base rounded-xl',
  xl: 'w-16 h-16 text-2xl rounded-2xl',
  '2xl': 'w-20 h-20 text-4xl rounded-2xl',
};

const GRADIENTS = {
  brand: 'bg-gradient-to-br from-brand to-rose-400',
  violet: 'bg-gradient-to-br from-violet-500 to-fuchsia-500',
  gray: 'bg-gradient-to-br from-stone-200 to-stone-300 dark:from-stone-700 dark:to-stone-600',
};

export const Avatar = forwardRef(function Avatar(
  {
    src,
    emoji,
    name,
    size = 'md',
    gradient = 'gray',
    className,
    ring = false,
    online = false,
    ...props
  },
  ref
) {
  const initials = name
    ? name.slice(0, 1).toUpperCase()
    : null;

  return (
    <div
      ref={ref}
      className={cn(
        'relative inline-flex items-center justify-center shrink-0 font-semibold overflow-hidden',
        ring && 'ring-2 ring-brand/20',
        SIZES[size],
        !src && !emoji && GRADIENTS[gradient],
        className
      )}
      {...props}
    >
      {src ? (
        <img src={src} alt={name || ''} className="w-full h-full object-cover" />
      ) : emoji ? (
        <span className="leading-none">{emoji}</span>
      ) : initials ? (
        <span className="text-white">{initials}</span>
      ) : null}

      {online && (
        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-success rounded-full ring-2 ring-bg" />
      )}
    </div>
  );
});
