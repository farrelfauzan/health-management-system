'use client';

import type { CheckMedicationStockToolResult } from '@hms/shared-types';
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ToolResultNotice } from '#components/client/ai-assistant/tool-result-notice';

type MedicationStockResultProps = {
  result: CheckMedicationStockToolResult;
};

/**
 * `check_medication_stock`, rendered as the table it is. Every number here
 * came from the pharmacy tables via the asking clinician's own permissions —
 * the model never saw it and could not have shaped it.
 */
export function MedicationStockResult({ result }: MedicationStockResultProps) {
  const t = useTranslations('aiAssistant.toolResults');
  if (result.items.length === 0) {
    return <ToolResultNotice message={t('empty')} />;
  }
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('stockColumns.medication')}</TableHead>
              <TableHead className="text-right">{t('stockColumns.stock')}</TableHead>
              <TableHead className="text-right">{t('stockColumns.reorder')}</TableHead>
              <TableHead>{t('stockColumns.status')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.items.map((item) => (
              <TableRow key={item.medicationCode}>
                <TableCell>
                  <span className="font-medium text-slate-900">{item.medicationName}</span>
                  {item.strength === undefined && item.form === undefined ? null : (
                    <span className="block text-xs text-slate-500">
                      {[item.strength, item.form].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {item.stockQty}
                  {item.unit === undefined ? null : (
                    <span className="ml-1 text-xs text-slate-500">{item.unit}</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums text-slate-500">
                  {item.reorderLevel}
                </TableCell>
                <TableCell>
                  <Badge variant={item.needsReorder ? 'destructive' : 'secondary'}>
                    {item.needsReorder ? t('stockStatus.needsReorder') : t('stockStatus.ok')}
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
