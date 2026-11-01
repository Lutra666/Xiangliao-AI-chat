import { forwardRef } from 'react';
import { cn } from '../../lib/cn';

export const Card = forwardRef(function Card(
  { className, children, hover = false, onClick, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      onClick={onClick}
      className={cn(
        'bg-surface border border-border rounded-xl shadow-xs',
        'transition-all duration-normal ease-out',
        hover && 'hover:shadow-md hover:border-border-strong cursor-pointer',
        onClick && 'cursor-pointer',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});

export const CardHeader = forwardRef(function CardHeader(
  { className, children, ...props }, ref
) {
  return (
    <div
      ref={ref}
      className={cn('px-5 py-4 border-b border-border', className)}
      {...props}
    >
      {children}
    </div>
  );
});

export const CardBody = forwardRef(function CardBody(
  { className, children, ...props }, ref
) {
  return (
    <div ref={ref} className={cn('p-5', className)} {...props}>
      {children}
    </div>
  );
});

export const CardFooter = forwardRef(function CardFooter(
  { className, children, ...props }, ref
) {
  return (
    <div
      ref={ref}
      className={cn('px-5 py-4 border-t border-border', className)}
      {...props}
    >
      {children}
    </div>
  );
});
