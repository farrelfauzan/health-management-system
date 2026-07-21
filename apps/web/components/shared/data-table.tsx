import type { ReactNode } from 'react';
import { Table, cn } from '@hms/ui';

type DataTableProps = {
  children: ReactNode;
  className?: string;
};

export function DataTable({ children, className }: DataTableProps) {
  return (
    <div
      className={cn(
        'overflow-x-auto rounded-xl border border-slate-200 bg-white',
        className,
      )}
    >
      <Table>{children}</Table>
    </div>
  );
}
