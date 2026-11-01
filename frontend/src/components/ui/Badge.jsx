import { cn } from '../../lib/cn';

const VARIANTS = {
  default: 'bg-surface-hover text-text-muted',
  brand: 'bg-brand-soft text-brand',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  outline: 'border border-border text-text-muted bg-transparent',
};

const SIZES = {
  sm: 'text-[10px] px-2 py-0.5 rounded',
  md: 'text-xs px-2.5 py-1 rounded-md',
  lg: 'text-sm px-3 py-1.5 rounded-md',
};

export function Badge({ variant = 'default', size = 'md', className, children, dot = false }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-medium whitespace-nowrap',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
