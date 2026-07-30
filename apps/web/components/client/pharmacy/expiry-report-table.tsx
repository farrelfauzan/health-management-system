'use client';

import type { ExpiryReportItemResponse } from '@hms/shared-types';
import { Badge, Card, CardContent, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

type ExpiryReportTableProps = {
  items: ExpiryReportItemResponse[];
  throughDate: string | undefined;
};

export function ExpiryReportTable({ items, throughDate }: ExpiryReportTableProps) {
  const t = useTranslations('pharmacyInventory');
  const format = useFormatter();

  return (
    <Card className="gap-0 overflow-hidden rounded-xl border-slate-200 py-0 shadow-none">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="font-heading text-base font-semibold text-slate-900">{t('expiryTitle')}</h2>
        <p className="mt-1 text-sm text-slate-500">{t('expiryDescription')}</p>
        {throughDate ? <p className="mt-2 text-xs text-slate-400">{t('through', { date: format.dateTime(new Date(`${throughDate}T00:00:00`), { dateStyle: 'medium' }) })}</p> : null}
      </div>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">{t('emptyExpiry')}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>{t('medication')}</TableHead><TableHead>{t('lot')}</TableHead><TableHead>{t('expiryDate')}</TableHead><TableHead>{t('remaining')}</TableHead><TableHead>{t('expiryStatus')}</TableHead></TableRow></TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell><p className="font-medium text-slate-900">{item.medicationName}</p><p className="font-mono text-xs text-slate-500">{item.medicationCode}</p></TableCell>
                    <TableCell className="font-mono text-xs">{item.batchNumber}</TableCell>
                    <TableCell>{item.expiryDate ? format.dateTime(new Date(`${item.expiryDate}T00:00:00`), { dateStyle: 'medium' }) : '-'}</TableCell>
                    <TableCell>{format.number(item.remainingQty)}</TableCell>
                    <TableCell><Badge variant={item.expiryStatus === 'EXPIRED' ? 'destructive' : 'outline'}>{t(`statuses.${item.expiryStatus}`)}</Badge>{typeof item.daysUntilExpiry === 'number' ? <p className="mt-1 text-xs text-slate-500">{item.daysUntilExpiry < 0 ? t('daysExpired', { count: Math.abs(item.daysUntilExpiry) }) : t('daysRemaining', { count: item.daysUntilExpiry })}</p> : null}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
