import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn';

export function Tooltip({ children, content, side = 'top', delay = 300, className }) {
  const [show, setShow] = useState(false);
  const timer = useRef(null);
  const ref = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const handleEnter = () => {
    timer.current = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const c = { top: r.top - 8, left: r.left + r.width / 2 };
      if (side === 'top') c.top = r.top - 8;
      else if (side === 'bottom') c.top = r.bottom + 8;
      else if (side === 'left') { c.top = r.top + r.height / 2; c.left = r.left - 8; }
      else if (side === 'right') { c.top = r.top + r.height / 2; c.left = r.right + 8; }
      setPos(c);
      setShow(true);
    }, delay);
  };

  const handleLeave = () => {
    if (timer.current) clearTimeout(timer.current);
    setShow(false);
  };

  useEffect(() => () => timer.current && clearTimeout(timer.current), []);

  if (!content) return children;

  return (
    <>
      <span
        ref={ref}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        onFocus={handleEnter}
        onBlur={handleLeave}
        className="inline-flex"
      >
        {children}
      </span>
      {show &&
        createPortal(
          <div
            role="tooltip"
            className={cn(
              'fixed z-[100] pointer-events-none px-2.5 py-1.5',
              'bg-text-header text-bg-elevated text-xs font-medium rounded-md shadow-lg',
              'animate-in fade-in zoom-in-95 duration-fast',
              side === 'top' && '-translate-x-1/2 -translate-y-full',
              side === 'bottom' && '-translate-x-1/2',
              side === 'left' && '-translate-x-full -translate-y-1/2',
              side === 'right' && '-translate-y-1/2',
              className
            )}
            style={{ top: pos.top, left: pos.left }}
          >
            {content}
          </div>,
          document.body
        )}
    </>
  );
}
