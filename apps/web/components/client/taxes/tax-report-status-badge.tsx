'use client';

import type { TaxReportListItem } from '@hms/shared-types';
import { Badge } from '@hms/ui';
import { useTranslations } from 'next-intl';

type TaxReportStatusBadgeProps = {
  report: TaxReportListItem;
  className?: string;
};

/** A drafted month's status: draft, final, or final but no longer matching the books. */
export function TaxReportStatusBadge({ report, className }: TaxReportStatusBadgeProps) {
  const t = useTranslations('operations.taxes.reports');
  const statusKey =
    report.isOutOfDate && report.status === 'FINALIZED' ? 'OUT_OF_DATE' : report.status;

  return (
    <Badge
      className={className}
      variant={
        statusKey === 'FINALIZED'
          ? 'default'
          : statusKey === 'OUT_OF_DATE'
            ? 'destructive'
            : 'outline'
      }
    >
      {t(`status.${statusKey}`)}
    </Badge>
  );
}
