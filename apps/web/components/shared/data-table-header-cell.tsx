import type { ComponentProps } from 'react';
import { TableHead, cn } from '@hms/ui';

type DataTableHeaderCellProps = ComponentProps<typeof TableHead>;

export function DataTableHeaderCell({ className, ...props }: DataTableHeaderCellProps) {
  return (
    <TableHead
      className={cn(
        'sticky top-0 h-10 bg-slate-50 px-4 font-heading text-xs font-medium uppercase tracking-wider text-slate-500',
        className,
      )}
      {...props}
    />
  );
}
