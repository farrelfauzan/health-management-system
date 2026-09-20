'use client';

import { useState } from 'react';
import type { TaxAssignmentKindValue, TaxCodeSourceValue } from '@hms/shared-types';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useAbility,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { InlineNotice } from '#components/client/shared/inline-notice';
import { TaxAssignmentBulkBar } from '#components/client/taxes/tax-assignment-bulk-bar';
import { TaxAssignmentsTable } from '#components/client/taxes/tax-assignments-table';
import { toTaxAssignmentKey } from '#lib/taxes/to-tax-assignment-key';
import { useTaxAssignments } from '#lib/taxes/use-tax-assignments';
import { useTaxCodes } from '#lib/taxes/use-tax-codes';

const PAGE_SIZE = 20;
const ALL = 'ALL';
const KIND_FILTERS: readonly TaxAssignmentKindValue[] = ['SERVICE_TARIFF', 'MEDICATION'];
const SOURCE_FILTERS: readonly TaxCodeSourceValue[] = [
  'OVERRIDE',
  'CATEGORY_DEFAULT',
  'UNRESOLVED',
];

/**
 * The tax code on every active tariff and medication (P27-T03) — "pengaturan
 * pajak untuk semua tarif". Each row says whether its code is its own or its
 * category's default; the unresolved count covers every item, not the page.
 */
export function TaxAssignmentsPanel() {
  const t = useTranslations('operations.taxes.assignments');
  const ability = useAbility();
  const canWrite = ability.can('write', 'TaxCode');
  const [page, setPage] = useState<number>(1);
  const [kind, setKind] = useState<TaxAssignmentKindValue | typeof ALL>(ALL);
  const [source, setSource] = useState<TaxCodeSourceValue | typeof ALL>(ALL);
  const [search, setSearch] = useState<string>('');
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(new Set());
  const { taxCodes } = useTaxCodes();
  const { rows, meta, isPending, isError } = useTaxAssignments({
    page,
    limit: PAGE_SIZE,
    ...(kind === ALL ? {} : { kind }),
    ...(source === ALL ? {} : { source }),
    ...(search.trim().length > 0 ? { search: search.trim() } : {}),
  });
  const total = meta?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function resetPaging(): void {
    setPage(1);
    setSelectedKeys(new Set());
  }

  function toggleSelected(key: string): void {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function togglePage(isSelected: boolean): void {
    setSelectedKeys(new Set(isSelected ? rows.map(toTaxAssignmentKey) : []));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {meta && meta.unresolvedCount > 0 ? (
          <InlineNotice tone="warning">
            {t('unresolved', { count: meta.unresolvedCount })}
          </InlineNotice>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-3">
          <Select
            value={kind}
            onValueChange={(value) => {
              setKind(value as TaxAssignmentKindValue | typeof ALL);
              resetPaging();
            }}
          >
            <SelectTrigger aria-label={t('filters.kind')} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('filters.allKinds')}</SelectItem>
              {KIND_FILTERS.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`kind.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={source}
            onValueChange={(value) => {
              setSource(value as TaxCodeSourceValue | typeof ALL);
              resetPaging();
            }}
          >
            <SelectTrigger aria-label={t('filters.source')} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('filters.allSources')}</SelectItem>
              {SOURCE_FILTERS.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`source.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            aria-label={t('filters.search')}
            placeholder={t('filters.search')}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              resetPaging();
            }}
          />
        </div>
        {canWrite ? (
          <TaxAssignmentBulkBar
            rows={rows}
            selectedKeys={selectedKeys}
            taxCodes={taxCodes}
            onApplied={() => setSelectedKeys(new Set())}
          />
        ) : null}
        <TaxAssignmentsTable
          rows={rows}
          isPending={isPending}
          isError={isError}
          canWrite={canWrite}
          selectedKeys={selectedKeys}
          onToggle={toggleSelected}
          onTogglePage={togglePage}
        />
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>{t('pageSummary', { page, lastPage, total })}</span>
          <div className="space-x-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => {
                setPage(page - 1);
                setSelectedKeys(new Set());
              }}
            >
              {t('previous')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= lastPage}
              onClick={() => {
                setPage(page + 1);
                setSelectedKeys(new Set());
              }}
            >
              {t('next')}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
