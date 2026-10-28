import type { HTMLAttributes, ReactNode } from 'react';

export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone;
  dot?: boolean;
  children: ReactNode;
}

export function StatusBadge({ tone = 'neutral', dot = false, className = '', children, ...props }: StatusBadgeProps) {
  return (
    <span {...props} className={['jn-badge', `jn-badge--${tone}`, className].filter(Boolean).join(' ')}>
      {dot && <span className="jn-badge__dot" aria-hidden="true" />}
      {children}
    </span>
  );
}
