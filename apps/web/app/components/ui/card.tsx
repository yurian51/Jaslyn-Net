import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: 'section' | 'article' | 'div';
  children: ReactNode;
}

export function Card({ as: Element = 'section', className = '', children, ...props }: CardProps) {
  return <Element {...props} className={['jn-card', className].filter(Boolean).join(' ')}>{children}</Element>;
}

export function CardHeader({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={['jn-card__header', className].filter(Boolean).join(' ')} />;
}

export function CardTitle({ className = '', ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 {...props} className={['jn-card__title', className].filter(Boolean).join(' ')} />;
}

export function CardDescription({ className = '', ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p {...props} className={['jn-card__description', className].filter(Boolean).join(' ')} />;
}

export function CardContent({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={['jn-card__content', className].filter(Boolean).join(' ')} />;
}

export function CardFooter({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={['jn-card__footer', className].filter(Boolean).join(' ')} />;
}
