'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CORETAX_UNIT_OPTIONS,
  type BulkAssignCoretaxCodesInput,
  type BulkAssignTaxCodeResult,
  type TaxAssignmentRowView,
} from '@hms/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  toast,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { FormLabel } from '#components/client/shared/form-label';
import { InlineNotice } from '#components/client/shared/inline-notice';
import { TaxCoretaxReferenceSelect } from '#components/client/taxes/tax-coretax-reference-select';
import { taxAssignmentControllerBulkAssignCoretaxCodesV1 } from '#lib/api/generated/tax-codes/tax-codes';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateTaxCodeQueries } from '#lib/taxes/invalidate-tax-code-queries';

const CORETAX_ITEM_CODE_PATTERN = /^\d{6}$/;

type TaxCoretaxCodesDialogProps = {
  rows: TaxAssignmentRowView[];
  onClose: () => void;
  onApplied: () => void;
};

/**
 * Sets the Coretax item code and unit on the selected tariffs and medicines
 * (P27-T09), overriding their tax code's on the faktur. Both blank clears the
 * override, so the items follow their tax code again.
 */
export function TaxCoretaxCodesDialog({ rows, onClose, onApplied }: TaxCoretaxCodesDialogProps) {
  const t = useTranslations('operations.taxes.assignments.coretaxDialog');
  const tForm = useTranslations('operations.taxes.codes.form');
  const tCodes = useTranslations('operations.taxes.codes');
  const tCommon = useTranslations('operations.common');
  const queryClient = useQueryClient();
  const [itemCode, setItemCode] = useState<string>('');
  const [unitCode, setUnitCode] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const applyMutation = useMutation({
    mutationFn: (payload: BulkAssignCoretaxCodesInput) =>
      taxAssignmentControllerBulkAssignCoretaxCodesV1(payload),
  });
  const isClearing = itemCode === '' && unitCode === '';
  const isComplete = CORETAX_ITEM_CODE_PATTERN.test(itemCode) && unitCode !== '';

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!isClearing && !isComplete) {
      setFormError(t('invalid'));
      return;
    }
    try {
      const response = await applyMutation.mutateAsync({
        targets: rows.map((row) => ({ kind: row.kind, id: row.id })),
        coretaxItemCode: isClearing ? null : itemCode,
        coretaxUnitCode: isClearing ? null : unitCode,
      });
      const result = parseApiSuccess<BulkAssignTaxCodeResult>(response, tCodes('saveError'));
      await invalidateTaxCodeQueries(queryClient);
      toast.success(t('applied', { count: result.data.updatedCount }));
      onApplied();
      onClose();
    } catch (caughtError) {
      setFormError(notifyApiError(caughtError, tCodes('saveError')));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">{t('title', { count: rows.length })}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <form noValidate className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          {formError ? <InlineNotice tone="error">{formError}</InlineNotice> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <FormLabel htmlFor="coretax-bulk-item-code">{tForm('coretaxItemCode')}</FormLabel>
              <Input
                id="coretax-bulk-item-code"
                className="font-mono"
                inputMode="numeric"
                maxLength={6}
                value={itemCode}
                placeholder="000000"
                onChange={(event) => setItemCode(event.target.value.trim())}
              />
            </div>
            <div className="space-y-1">
              <FormLabel htmlFor="coretax-bulk-unit">{tForm('coretaxUnitCode')}</FormLabel>
              <TaxCoretaxReferenceSelect
                id="coretax-bulk-unit"
                value={unitCode}
                options={CORETAX_UNIT_OPTIONS}
                noneLabel={tForm('coretaxNone')}
                onChange={setUnitCode}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {tCommon('cancel')}
            </Button>
            <Button type="submit" disabled={applyMutation.isPending}>
              {applyMutation.isPending ? tCommon('saving') : t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
