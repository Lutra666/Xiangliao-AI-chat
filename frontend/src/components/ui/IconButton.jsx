import { forwardRef } from 'react';
import { cn } from '../../lib/cn';

const SIZES = {
  sm: 'h-8 w-8 rounded-lg',
  iconSm: 'h-8 w-8 rounded-lg',
  md: 'h-10 w-10 rounded-xl',
  icon: 'h-10 w-10 rounded-xl',
  lg: 'h-11 w-11 rounded-xl',
};

const VARIANTS = {
  ghost: 'text-text-muted hover:bg-surface-hover hover:text-text',
  primary: 'text-brand hover:bg-brand-soft hover:text-brand-hover',
  danger: 'text-text-muted hover:bg-danger-soft hover:text-danger',
  active: 'bg-brand-soft text-brand hover:bg-brand-soft-hover',
};

export const IconButton = forwardRef(function IconButton(
  {
    variant = 'ghost',
    size = 'md',
    className,
    children,
    label,
    active = false,
    ...props
  },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center shrink-0 cursor-pointer',
        'transition-all duration-fast ease-out active:scale-95',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        'disabled:opacity-40 disabled:pointer-events-none',
        SIZES[size],
        active ? VARIANTS.active : VARIANTS[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
});
