import { cn } from '../../lib/cn';

const SIZES = {
  sm: 'w-4 h-4 border-2',
  md: 'w-5 h-5 border-2',
  lg: 'w-7 h-7 border-[3px]',
};

export function Spinner({ size = 'md', className }) {
  return (
    <span
      role="status"
      aria-label="加载中"
      className={cn(
        'inline-block rounded-full border-current border-t-transparent animate-spin',
        'text-brand',
        SIZES[size],
        className
      )}
    />
  );
}
