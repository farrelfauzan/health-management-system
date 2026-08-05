'use client';

import type { CheckMedicationExpiryToolResult } from '@hms/shared-types';
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ToolResultHeadline } from '#components/client/ai-assistant/tool-result-headline';
import { ToolResultNotice } from '#components/client/ai-assistant/tool-result-notice';

type MedicationExpiryResultProps = {
  result: CheckMedicationExpiryToolResult;
};

const EXPIRY_BADGE_VARIANT = {
  EXPIRED: 'destructive',
  EXPIRING: 'default',
  UNKNOWN: 'outline',
} as const;

/**
 * `check_medication_expiry`, batch by batch. The counts above the table are
 * computed over the whole report rather than the rendered page, so "3
 * kedaluwarsa" stays true when the twenty soonest batches are shown.
 */
export function MedicationExpiryResult({ result }: MedicationExpiryResultProps) {
  const t = useTranslations('aiAssistant.toolResults');
  if (result.items.length === 0) {
    return <ToolResultNotice message={t('empty')} />;
  }
  return (
    <div className="space-y-2">
      <ToolResultHeadline
        text={t('expirySummary', {
          expired: result.expiredCount,
          expiring: result.expiringCount,
          unknown: result.unknownExpiryCount,
        })}
      />
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('expiryColumns.medication')}</TableHead>
              <TableHead>{t('expiryColumns.batch')}</TableHead>
              <TableHead>{t('expiryColumns.expiryDate')}</TableHead>
              <TableHead className="text-right">{t('expiryColumns.remaining')}</TableHead>
              <TableHead>{t('expiryColumns.status')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Two receipts of the same batch are two rows; see the note in
                appointment-load-result.tsx on why position is the key here. */}
            {result.items.map((item, index) => (
              <TableRow key={index}>
                <TableCell className="font-medium text-slate-900">{item.medicationName}</TableCell>
                <TableCell className="font-mono text-xs">{item.batchNumber}</TableCell>
                <TableCell className="tabular-nums">
                  {item.expiryDate ?? t('unknownExpiryDate')}
                </TableCell>
                <TableCell className="text-right tabular-nums">{item.remainingQty}</TableCell>
                <TableCell>
                  <Badge variant={EXPIRY_BADGE_VARIANT[item.expiryStatus]}>
                    {t(`expiryStatus.${item.expiryStatus}`)}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {result.matchCount > result.items.length ? (
        <p className="text-xs text-slate-500">
          {t('shownOf', { shown: result.items.length, total: result.matchCount })}
        </p>
      ) : null}
    </div>
  );
}
