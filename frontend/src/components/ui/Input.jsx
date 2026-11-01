import { forwardRef } from 'react';
import { cn } from '../../lib/cn';

export const Input = forwardRef(function Input(
  {
    className,
    invalid = false,
    size = 'md',
    prefix,
    suffix,
    ...props
  },
  ref
) {
  const sizes = {
    sm: 'h-8 text-xs px-3 rounded-md',
    md: 'h-10 text-sm px-3.5 rounded-md',
    lg: 'h-11 text-[15px] px-4 rounded-lg',
  };

  if (prefix || suffix) {
    return (
      <div
        className={cn(
          'inline-flex items-center w-full bg-surface border border-border rounded-md shadow-xs',
          'transition-all duration-fast ease-out',
          'focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20',
          invalid && 'border-danger focus-within:border-danger focus-within:ring-danger/20',
          className
        )}
      >
        {prefix && <span className="pl-3 text-text-subtle shrink-0">{prefix}</span>}
        <input
          ref={ref}
          className={cn(
            'flex-1 bg-transparent border-0 outline-none min-w-0',
            'text-text placeholder:text-text-subtle',
            sizes[size],
            prefix && 'pl-2',
            suffix && 'pr-2'
          )}
          {...props}
        />
        {suffix && <span className="pr-3 text-text-subtle shrink-0">{suffix}</span>}
      </div>
    );
  }

  return (
    <input
      ref={ref}
      className={cn(
        'w-full bg-surface border border-border text-text placeholder:text-text-subtle shadow-xs',
        'transition-all duration-fast ease-out',
        'hover:border-border-strong',
        'focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20',
        'disabled:opacity-50 disabled:bg-surface-hover',
        invalid && 'border-danger focus:border-danger focus:ring-danger/20',
        sizes[size],
        className
      )}
      {...props}
    />
  );
});
