import { cn } from '../../lib/cn';

export function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn(
        'bg-surface-hover rounded-md animate-pulse',
        className
      )}
      {...props}
    />
  );
}
