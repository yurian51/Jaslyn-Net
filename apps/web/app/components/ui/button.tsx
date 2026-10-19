'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  loadingText?: string;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

/** A native button with consistent variants, disabled and async/loading behavior. */
export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  loadingText = 'Loading…',
  leadingIcon,
  trailingIcon,
  className = '',
  children,
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={['jn-button', `jn-button--${variant}`, `jn-button--${size}`, className].filter(Boolean).join(' ')}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
    >
      {isLoading ? <span className="jn-spinner" aria-hidden="true" /> : leadingIcon}
      <span>{isLoading ? loadingText : children}</span>
      {!isLoading && trailingIcon}
    </button>
  );
}
