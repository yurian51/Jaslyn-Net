import type { ReactNode } from 'react';

export function Skeleton({
  className = '',
  width,
  height,
  rounded = false,
}: {
  className?: string;
  width?: string | number;
  height?: string | number;
  rounded?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={['jn-skeleton', rounded && 'jn-skeleton--rounded', className].filter(Boolean).join(' ')}
      style={{ width, height }}
    />
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className = '',
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={['jn-empty-state', className].filter(Boolean).join(' ')} role="status">
      {icon && <div className="jn-empty-state__icon" aria-hidden="true">{icon}</div>}
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && <div className="jn-empty-state__action">{action}</div>}
    </div>
  );
}


/**
 * Page or panel-level failure state. Supply a real retry action when recovery is possible;
 * the component never invents a retry behavior or hides the underlying error message.
 */
export function ErrorState({
  title = 'Something went wrong',
  description = 'We could not complete this request. Try again, or contact your administrator if the problem continues.',
  action,
  className = '',
}: {
  title?: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={['jn-error-state', className].filter(Boolean).join(' ')} role="alert" aria-live="assertive">
      <span className="jn-error-state__mark" aria-hidden="true">!</span>
      <div className="jn-error-state__content">
        <h3>{title}</h3>
        <p>{description}</p>
        {action && <div className="jn-error-state__action">{action}</div>}
      </div>
    </section>
  );
}

export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

export function Alert({
  tone = 'info',
  title,
  children,
  className = '',
}: {
  tone?: AlertTone;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  const isUrgent = tone === 'danger';
  return (
    <div
      className={['jn-alert', `jn-alert--${tone}`, className].filter(Boolean).join(' ')}
      role={isUrgent ? 'alert' : 'status'}
      aria-live={isUrgent ? 'assertive' : 'polite'}
    >
      <div>
        {title && <strong className="jn-alert__title">{title}</strong>}
        <div className="jn-alert__body">{children}</div>
      </div>
    </div>
  );
}
