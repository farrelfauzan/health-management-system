'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  BulkAssignTaxCodeInput,
  BulkAssignTaxCodeResult,
  TaxAssignmentRowView,
  TaxCodeView,
} from '@hms/shared-types';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { TaxCoretaxCodesDialog } from '#components/client/taxes/tax-coretax-codes-dialog';
import { taxAssignmentControllerBulkAssignV1 } from '#lib/api/generated/tax-codes/tax-codes';
import { notifyApiError } from '#lib/api/notify-api-error';
import { notifyStatement } from '#lib/api/notify-statement';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateTaxCodeQueries } from '#lib/taxes/invalidate-tax-code-queries';
import { resolveTaxCodeErrorCode } from '#lib/taxes/resolve-tax-code-error-code';
import { toTaxAssignmentKey } from '#lib/taxes/to-tax-assignment-key';

type TaxAssignmentBulkBarProps = {
  rows: TaxAssignmentRowView[];
  selectedKeys: ReadonlySet<string>;
  taxCodes: TaxCodeView[];
  onApplied: () => void;
};

/**
 * "Terapkan kode pajak" for the selected rows (P27-T03): one code on all of
 * them in one transaction, or back to their category default. Also opens the
 * Coretax item code and unit override for them (P27-T09).
 */
export function TaxAssignmentBulkBar({
  rows,
  selectedKeys,
  taxCodes,
  onApplied,
}: TaxAssignmentBulkBarProps) {
  const t = useTranslations('operations.taxes.assignments');
  const tCodes = useTranslations('operations.taxes.codes');
  const queryClient = useQueryClient();
  const [taxCodeId, setTaxCodeId] = useState<string>('');
  const [isCoretaxDialogOpen, setIsCoretaxDialogOpen] = useState<boolean>(false);
  const selectedRows = rows.filter((row) => selectedKeys.has(toTaxAssignmentKey(row)));
  const applyMutation = useMutation({
    mutationFn: (payload: BulkAssignTaxCodeInput) => taxAssignmentControllerBulkAssignV1(payload),
  });

  async function handleApply(nextTaxCodeId: string | null): Promise<void> {
    try {
      const response = await applyMutation.mutateAsync({
        targets: selectedRows.map((row) => ({ kind: row.kind, id: row.id })),
        taxCodeId: nextTaxCodeId,
      });
      const result = parseApiSuccess<BulkAssignTaxCodeResult>(response, tCodes('saveError'));
      await invalidateTaxCodeQueries(queryClient);
      toast.success(t('applied', { count: result.data.updatedCount }));
      onApplied();
    } catch (caughtError) {
      const code = resolveTaxCodeErrorCode(caughtError);
      if (code) {
        notifyStatement({ tone: 'error', title: tCodes(`errors.${code}`) });
        return;
      }
      notifyApiError(caughtError, tCodes('saveError'));
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <span className="text-sm text-slate-700">
        {t('selected', { count: selectedRows.length })}
      </span>
      <Select value={taxCodeId} onValueChange={setTaxCodeId}>
        <SelectTrigger aria-label={t('chooseCode')} className="w-64">
          <SelectValue placeholder={t('chooseCode')} />
        </SelectTrigger>
        <SelectContent>
          {taxCodes
            .filter((code) => code.isActive)
            .map((code) => (
              <SelectItem key={code.id} value={code.id}>
                {code.code} — {code.name}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        className="bg-primary-container hover:bg-primary"
        disabled={selectedRows.length === 0 || taxCodeId === '' || applyMutation.isPending}
        onClick={() => void handleApply(taxCodeId)}
      >
        {t('apply')}
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={selectedRows.length === 0 || applyMutation.isPending}
        onClick={() => void handleApply(null)}
      >
        {t('resetToDefault')}
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={selectedRows.length === 0}
        onClick={() => setIsCoretaxDialogOpen(true)}
      >
        {t('setCoretaxCodes')}
      </Button>
      {isCoretaxDialogOpen ? (
        <TaxCoretaxCodesDialog
          rows={selectedRows}
          onClose={() => setIsCoretaxDialogOpen(false)}
          onApplied={onApplied}
        />
      ) : null}
    </div>
  );
}
