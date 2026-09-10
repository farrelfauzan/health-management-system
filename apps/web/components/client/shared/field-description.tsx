'use client';

import type { ReactNode } from 'react';
import { cn } from '@hms/ui';

type FieldDescriptionProps = {
  /** Element id; the caller passes the same value as the input's `aria-describedby`. */
  id: string;
  children: ReactNode;
  className?: string;
};

/**
 * One short sentence under an input that says what to enter. Use it when a
 * field is not self-evident and the explanation fits in a line; anything
 * longer, or anything that cites a source, belongs in `LabelInfoTooltip`.
 */
export function FieldDescription({ id, children, className }: FieldDescriptionProps) {
  return (
    <p id={id} className={cn('text-xs text-muted-foreground', className)}>
      {children}
    </p>
  );
}
