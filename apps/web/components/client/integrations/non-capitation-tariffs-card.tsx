'use client';

import { useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Icon,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { NonCapitationTariffForm } from '#components/client/integrations/non-capitation-tariff-form';
import { InlineNotice } from '#components/client/shared/inline-notice';
import { formatRupiah } from '#lib/billing/format-rupiah';
import { useNonCapitationTariffs } from '#lib/bpjs-non-capitation/use-non-capitation-tariffs';

type NonCapitationTariffsCardProps = {
  canWrite: boolean;
};

/** The tariff history the recap prices each line from (P25-T16). */
export function NonCapitationTariffsCard({ canWrite }: NonCapitationTariffsCardProps) {
  const t = useTranslations('operations.integrations.nonCapitation');
  const format = useFormatter();
  const tariffsQuery = useNonCapitationTariffs();
  const [isAdding, setIsAdding] = useState(false);
  const tariffs = tariffsQuery.data ?? [];
  const formatDay = (value: string): string =>
    format.dateTime(new Date(`${value}T00:00:00Z`), { dateStyle: 'medium', timeZone: 'UTC' });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('tariffs.title')}</CardTitle>
        <CardDescription>{t('tariffs.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {tariffsQuery.isError ? (
          <InlineNotice tone="error">{t('tariffs.loadError')}</InlineNotice>
        ) : null}
        {tariffsQuery.isSuccess && tariffs.length === 0 ? (
          <InlineNotice tone="warning">{t('tariffs.empty')}</InlineNotice>
        ) : null}
        {tariffs.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('tariffs.serviceType')}</TableHead>
                <TableHead className="text-right">{t('tariffs.amount')}</TableHead>
                <TableHead>{t('tariffs.validity')}</TableHead>
                <TableHead>{t('tariffs.reference')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tariffs.map((tariff) => (
                <TableRow key={tariff.id}>
                  <TableCell>{t(`serviceTypes.${tariff.serviceType}`)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {formatRupiah(tariff.amount)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDay(tariff.validFrom)} –{' '}
                    {tariff.validUntil === null
                      ? t('tariffs.stillValid')
                      : formatDay(tariff.validUntil)}
                  </TableCell>
                  <TableCell className="text-xs text-slate-600">
                    {tariff.regulationReference}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
        {canWrite && isAdding ? (
          <NonCapitationTariffForm onDone={() => setIsAdding(false)} />
        ) : null}
        {canWrite && !isAdding ? (
          <Button type="button" variant="outline" onClick={() => setIsAdding(true)}>
            <Icon name="add" size={17} />
            {t('tariffs.add')}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
