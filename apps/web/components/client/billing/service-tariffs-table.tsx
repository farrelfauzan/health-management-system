'use client';

import type { ServiceTariffResponse, TaxPriceBreakdownView } from '@hms/shared-types';
import { TableBody, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ServiceTariffsTableRow } from '#components/client/billing/service-tariffs-table-row';
import { DataTable } from '#components/shared/data-table';
import { DataTableHeaderCell } from '#components/shared/data-table-header-cell';
import { EmptyState } from '#components/shared/empty-state';
import { TableSkeleton } from '#components/shared/table-skeleton';

const TABLE_COLUMN_COUNT = 7;

const BREAKDOWN_COLUMN_COUNT = 2;

type ServiceTariffsTableProps = {
  tariffs: ServiceTariffResponse[];
  isPending: boolean;
  isError: boolean;
  canManage: boolean;
  /** P27-T04: before-PPN and PPN per tariff, for admins; `null` hides the columns. */
  breakdownById?: ReadonlyMap<string, TaxPriceBreakdownView> | null;
  onEdit: (tariff: ServiceTariffResponse) => void;
};

export function ServiceTariffsTable({
  tariffs,
  isPending,
  isError,
  canManage,
  breakdownById = null,
  onEdit,
}: ServiceTariffsTableProps) {
  const t = useTranslations('operations');
  const tBreakdown = useTranslations('shared.taxBreakdown');
  const showBreakdown = breakdownById !== null;
  const showEmptyState = !isPending && tariffs.length === 0;

  if (showEmptyState) {
    return (
      <EmptyState
        icon={isError ? 'error' : 'price_change'}
        title={isError ? t('billing.tariffError') : t('billing.emptyTariffs')}
        description={
          isError
            ? 'Something went wrong while fetching the price list. It retries automatically.'
            : 'Add a consultation tariff first — without one, generated invoices report a gap instead of billing the visit.'
        }
      />
    );
  }

  return (
    <DataTable>
      <TableHeader>
        <TableRow>
          <DataTableHeaderCell>{t('common.code')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('common.name')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('common.category')}</DataTableHeaderCell>
          <DataTableHeaderCell>ICD-9-CM</DataTableHeaderCell>
          <DataTableHeaderCell>{t('common.price')}</DataTableHeaderCell>
          {showBreakdown ? (
            <>
              <DataTableHeaderCell>{tBreakdown('priceBeforeTax')}</DataTableHeaderCell>
              <DataTableHeaderCell>{tBreakdown('taxAmount')}</DataTableHeaderCell>
            </>
          ) : null}
          <DataTableHeaderCell>{t('common.status')}</DataTableHeaderCell>
          <DataTableHeaderCell className="text-right">{t('common.actions')}</DataTableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isPending ? (
          <TableSkeleton
            columns={TABLE_COLUMN_COUNT + (showBreakdown ? BREAKDOWN_COLUMN_COUNT : 0)}
          />
        ) : (
          tariffs.map((tariff) => (
            <ServiceTariffsTableRow
              key={tariff.id}
              tariff={tariff}
              canManage={canManage}
              breakdown={breakdownById?.get(tariff.id)}
              showBreakdown={showBreakdown}
              onEdit={onEdit}
            />
          ))
        )}
      </TableBody>
    </DataTable>
  );
}
