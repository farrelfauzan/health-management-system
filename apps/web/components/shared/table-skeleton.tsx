import { Skeleton, TableCell, TableRow } from '@hms/ui';

type TableSkeletonProps = {
  columns: number;
  rows?: number;
};

export function TableSkeleton({ columns, rows = 5 }: TableSkeletonProps) {
  return (
    <>
      {Array.from({ length: rows }, (_, rowIndex) => (
        <TableRow key={rowIndex}>
          {Array.from({ length: columns }, (_, columnIndex) => (
            <TableCell key={columnIndex} className="px-4 py-3">
              <Skeleton className="h-4 w-full max-w-36" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}
