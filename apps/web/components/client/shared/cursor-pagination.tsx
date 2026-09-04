'use client';

import { Button, Icon, cn } from '@hms/ui';
import { useTranslations } from 'next-intl';

type CursorPaginationProps = {
  pageNumber: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  onPrevious: () => void;
  onNext: () => void;
  isDisabled?: boolean;
  className?: string;
};

/**
 * Previous / next over a cursor-fed list. The sibling `NumberedPagination`
 * needs a total the cursor APIs do not return, so this one shows only where
 * the reader is and whether there is more.
 */
export function CursorPagination({
  pageNumber,
  hasPreviousPage,
  hasNextPage,
  onPrevious,
  onNext,
  isDisabled = false,
  className,
}: CursorPaginationProps) {
  const t = useTranslations('shared.pagination');

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <p className="text-sm text-slate-500">{t('page', { page: pageNumber })}</p>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={t('previousPage')}
          disabled={isDisabled || !hasPreviousPage}
          onClick={onPrevious}
        >
          <Icon name="chevron_left" size={18} />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={t('nextPage')}
          disabled={isDisabled || !hasNextPage}
          onClick={onNext}
        >
          <Icon name="chevron_right" size={18} />
        </Button>
      </div>
    </div>
  );
}
