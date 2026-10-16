import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** One titled block of sidebar controls. */
export function Section({
  title,
  aside,
  children,
  className,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('space-y-3', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="ds-eyebrow">{title}</h3>
        {aside != null && <div className="min-w-0 truncate text-2xs text-muted-foreground">{aside}</div>}
      </div>
      {children}
    </section>
  );
}
