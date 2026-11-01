import { forwardRef } from 'react';
import { cn } from '../../lib/cn';

const VARIANTS = {
  primary:
    'bg-brand text-brand-on shadow-sm hover:bg-brand-hover active:bg-brand-active hover:shadow-glow',
  secondary:
    'bg-surface text-text border border-border-strong hover:bg-surface-hover hover:border-brand shadow-xs',
  ghost:
    'bg-transparent text-text-muted hover:bg-surface-hover hover:text-text',
  soft:
    'bg-brand-soft text-brand hover:bg-brand-soft-hover',
  danger:
    'bg-danger text-white shadow-sm hover:opacity-90 active:opacity-80',
  subtle:
    'bg-surface-hover text-text-muted hover:bg-surface-active hover:text-text',
};

const SIZES = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-md',
  md: 'h-10 px-4 text-sm gap-2 rounded-md',
  lg: 'h-11 px-5 text-[15px] gap-2 rounded-lg',
  icon: 'h-10 w-10 rounded-md',
  iconSm: 'h-8 w-8 rounded-md',
};

export const Button = forwardRef(function Button(
  {
    variant = 'secondary',
    size = 'md',
    className,
    children,
    loading = false,
    disabled,
    type = 'button',
    ...props
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-medium select-none whitespace-nowrap',
        'transition-all duration-normal ease-out cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        'disabled:opacity-50 disabled:pointer-events-none',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...props}
    >
      {loading ? (
        <span className="inline-block w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
      ) : (
        children
      )}
    </button>
  );
});
