'use client';

import { Button, Icon, cn } from '@hms/ui';

import { buildPaginationWindow } from '#lib/shared/pagination-window';

type NumberedPaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  itemLabel?: string;
  isDisabled?: boolean;
  className?: string;
};

export function NumberedPagination({
  page,
  pageSize,
  total,
  onPageChange,
  itemLabel = 'items',
  isDisabled = false,
  className,
}: NumberedPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const rangeStart = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, total);
  const windowItems = buildPaginationWindow(currentPage, totalPages);

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <p className="text-sm text-slate-500">
        Showing {rangeStart}–{rangeEnd} of {total} {itemLabel}
      </p>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="Previous page"
          disabled={isDisabled || currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          <Icon name="chevron_left" size={18} />
        </Button>
        {windowItems.map((item, index) =>
          item === 'ellipsis' ? (
            <span key={`ellipsis-${index}`} className="px-1.5 text-sm text-slate-400">
              …
            </span>
          ) : (
            <Button
              key={item}
              type="button"
              variant={item === currentPage ? 'default' : 'outline'}
              size="icon-sm"
              aria-label={`Page ${item}`}
              aria-current={item === currentPage ? 'page' : undefined}
              disabled={isDisabled}
              className={cn(item === currentPage && 'bg-primary-container hover:bg-primary')}
              onClick={() => onPageChange(item)}
            >
              {item}
            </Button>
          ),
        )}
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="Next page"
          disabled={isDisabled || currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
        >
          <Icon name="chevron_right" size={18} />
        </Button>
      </div>
    </div>
  );
}
