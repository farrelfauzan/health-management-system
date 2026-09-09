'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { MedicationResponse, StockReceiptResponse } from '@hms/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { FieldDescription } from '#components/client/shared/field-description';
import { FormLabel } from '#components/client/shared/form-label';
import { RequiredLegend } from '#components/client/shared/required-legend';
import { inventoryControllerCreateReceiptV1 } from '#lib/api/generated/pharmacy-inventory/pharmacy-inventory';
import type { CreateStockReceiptDto } from '#lib/api/generated/model/createStockReceiptDto';
import { parseApiSuccess } from '#lib/api/response';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { invalidatePharmacyQueries } from '#lib/pharmacy/invalidate-pharmacy-queries';

type ReceiveStockDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  medications: MedicationResponse[];
  initialMedicationId?: string;
  onSaved: (message: string) => void;
};

export function ReceiveStockDialog({
  open,
  onOpenChange,
  medications,
  initialMedicationId,
  onSaved,
}: ReceiveStockDialogProps) {
  const t = useTranslations('pharmacyInventory');
  const queryClient = useQueryClient();
  const [medicationId, setMedicationId] = useState(initialMedicationId ?? '');
  const [batchNumber, setBatchNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [quantity, setQuantity] = useState('');
  const [receivedAt, setReceivedAt] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const receiveMutation = useMutation({
    mutationFn: (payload: CreateStockReceiptDto) => inventoryControllerCreateReceiptV1(payload),
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    const parsedQuantity = Number(quantity);
    if (
      !medicationId ||
      !batchNumber.trim() ||
      !expiryDate ||
      !Number.isInteger(parsedQuantity) ||
      parsedQuantity < 1
    ) {
      setError(t('requiredFields'));
      return;
    }
    const payload = {
      medicationId,
      batchNumber: batchNumber.trim(),
      expiryDate,
      quantity: parsedQuantity,
      ...(receivedAt ? { receivedAt: new Date(receivedAt).toISOString() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    } satisfies CreateStockReceiptDto;

    try {
      const response = await receiveMutation.mutateAsync(payload);
      parseApiSuccess<StockReceiptResponse>(response, t('receiveError'));
      await invalidatePharmacyQueries(queryClient);
      onSaved(t('stockReceived'));
      onOpenChange(false);
    } catch (cause) {
      setError(resolveApiErrorMessage(cause, t('receiveError')));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form noValidate onSubmit={(event) => void handleSubmit(event)}>
          <DialogHeader>
            <DialogTitle>{t('receiveStock')}</DialogTitle>
            <DialogDescription>{t('noAbsoluteStock')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-5">
            <RequiredLegend />
            {error ? <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
            <div className="space-y-1.5"><FormLabel htmlFor="receive-stock-medication" required>{t('medication')}</FormLabel><Select value={medicationId} onValueChange={setMedicationId}><SelectTrigger id="receive-stock-medication" className="w-full"><SelectValue placeholder={t('selectMedication')} /></SelectTrigger><SelectContent>{medications.map((medication) => <SelectItem key={medication.id} value={medication.id}>{medication.code} · {medication.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <FormLabel htmlFor="receive-stock-batch-number" required>{t('batchNumber')}</FormLabel>
                <Input
                  id="receive-stock-batch-number"
                  aria-describedby="receive-stock-batch-number-description"
                  value={batchNumber}
                  onChange={(event) => setBatchNumber(event.target.value)}
                />
                <FieldDescription id="receive-stock-batch-number-description">{t('batchNumberDescription')}</FieldDescription>
              </div>
              <div className="space-y-1.5"><FormLabel htmlFor="receive-stock-expiry-date" required>{t('expiryDate')}</FormLabel><Input id="receive-stock-expiry-date" type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} /></div>
              <div className="space-y-1.5">
                <FormLabel htmlFor="receive-stock-quantity" required>{t('quantity')}</FormLabel>
                <Input
                  id="receive-stock-quantity"
                  type="number"
                  min="1"
                  max="1000000"
                  aria-describedby="receive-stock-quantity-description"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                />
                <FieldDescription id="receive-stock-quantity-description">{t('quantityDescription')}</FieldDescription>
              </div>
              <div className="space-y-1.5">
                <FormLabel htmlFor="receive-stock-received-at">{t('receivedAt')}</FormLabel>
                <Input
                  id="receive-stock-received-at"
                  type="datetime-local"
                  aria-describedby="receive-stock-received-at-description"
                  value={receivedAt}
                  onChange={(event) => setReceivedAt(event.target.value)}
                />
                <FieldDescription id="receive-stock-received-at-description">{t('receivedAtDescription')}</FieldDescription>
              </div>
            </div>
            <div className="space-y-1.5">
              <FormLabel htmlFor="receive-stock-notes">{t('notes')}</FormLabel>
              <Textarea
                id="receive-stock-notes"
                maxLength={1000}
                placeholder={t('notesPlaceholder')}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('cancel')}</Button>
            <Button type="submit" disabled={receiveMutation.isPending}>{receiveMutation.isPending ? t('receiving') : t('receiveStock')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
