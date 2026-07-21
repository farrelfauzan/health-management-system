import type { ComponentProps } from 'react';
import { TableCell, cn } from '@hms/ui';

type DataTableMonoCellProps = ComponentProps<typeof TableCell>;

export function DataTableMonoCell({ className, ...props }: DataTableMonoCellProps) {
  return (
    <TableCell
      className={cn('px-4 font-mono text-[13px] text-slate-600', className)}
      {...props}
    />
  );
}
