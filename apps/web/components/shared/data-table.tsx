import type { ReactNode } from 'react';
import { Table, cn } from '@hms/ui';

type DataTableProps = {
  children: ReactNode;
  className?: string;
  /**
   * Width below which the table scrolls horizontally instead of compressing
   * its columns. Without it a wide table squeezes every cell into wrapped,
   * unreadable text before the scroll container is ever reached.
   */
  minWidthClassName?: string;
};

export function DataTable({
  children,
  className,
  minWidthClassName = 'min-w-[56rem]',
}: DataTableProps) {
  return (
    <div
      className={cn(
        // max-w-full keeps the frame inside its column so the scroll happens
        // within the table rather than pushing the page sideways.
        'w-full max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-white',
        className,
      )}
    >
      <Table className={minWidthClassName}>{children}</Table>
    </div>
  );
}
