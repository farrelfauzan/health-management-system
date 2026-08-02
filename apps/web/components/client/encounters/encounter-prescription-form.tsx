'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreatePrescriptionInput, PrescriptionResponse } from '@hms/shared-types';
import { Button, Input } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { CodeSearchPicker } from '#components/client/encounters/code-search-picker';
import { EncounterPrescriptionDraftRow } from '#components/client/encounters/encounter-prescription-draft-row';
import { prescriptionControllerCreatePrescriptionV1 } from '#lib/api/generated/pharmacy-flow/pharmacy-flow';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import type { CodeSearchOption } from '#lib/encounters/code-search-option';
import { invalidateEncounterQueries } from '#lib/encounters/invalidate-encounter-queries';
import type { PrescriptionDraftItem } from '#lib/encounters/prescription-draft-item';
import { useMedicationSearch } from '#lib/encounters/use-medication-search';

type EncounterPrescriptionFormProps = {
  encounterId: string;
  patientId: string;
};

export function EncounterPrescriptionForm({
  encounterId,
  patientId,
}: EncounterPrescriptionFormProps) {
  const queryClient = useQueryClient();
  const t = useTranslations('clinical');
  const [search, setSearch] = useState<string>('');
  const [selected, setSelected] = useState<CodeSearchOption | null>(null);
  const [dosage, setDosage] = useState<string>('');
  const [frequency, setFrequency] = useState<string>('');
  const [durationDays, setDurationDays] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('');
  const [instructions, setInstructions] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [items, setItems] = useState<PrescriptionDraftItem[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const medicationQuery = useMedicationSearch(search);
  const createMutation = useMutation({
    mutationFn: (payload: CreatePrescriptionInput) =>
      prescriptionControllerCreatePrescriptionV1(payload),
  });

  function resetItemFields(): void {
    setSelected(null);
    setSearch('');
    setDosage('');
    setFrequency('');
    setDurationDays('');
    setQuantity('');
    setInstructions('');
  }

  function handleAddItem(): void {
    setActionError(null);
    if (!selected) {
      setActionError(t('encounters.prescriptionForm.pickMedication'));
      return;
    }
    if (items.some((item) => item.medicationId === selected.id)) {
      setActionError(t('encounters.prescriptionForm.duplicateMedication'));
      return;
    }
    const parsedQuantity = Number.parseInt(quantity, 10);
    const parsedDuration = durationDays ? Number.parseInt(durationDays, 10) : undefined;
    if (!dosage.trim() || !frequency.trim() || !Number.isInteger(parsedQuantity)) {
      setActionError(t('encounters.prescriptionForm.itemFieldsRequired'));
      return;
    }
    const draftItem: PrescriptionDraftItem = {
      medicationId: selected.id,
      medicationCode: selected.code,
      medicationName: selected.display,
      dosage: dosage.trim(),
      frequency: frequency.trim(),
      ...(parsedDuration && parsedDuration > 0 ? { durationDays: parsedDuration } : {}),
      quantity: parsedQuantity,
      ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
    };
    setItems((current) => [...current, draftItem]);
    resetItemFields();
  }

  function handleRemoveItem(medicationId: string): void {
    setItems((current) => current.filter((item) => item.medicationId !== medicationId));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setActionError(null);
    if (items.length === 0) {
      setActionError(t('encounters.prescriptionForm.itemsRequired'));
      return;
    }
    const trimmedNotes = notes.trim();
    const payload: CreatePrescriptionInput = {
      patientId,
      encounterId,
      ...(trimmedNotes.length > 0 ? { notes: trimmedNotes } : {}),
      items: items.map((item) => ({
        medicationId: item.medicationId,
        dosage: item.dosage,
        frequency: item.frequency,
        ...(item.durationDays !== undefined ? { durationDays: item.durationDays } : {}),
        quantity: item.quantity,
        ...(item.instructions !== undefined ? { instructions: item.instructions } : {}),
      })),
    };
    try {
      const response = await createMutation.mutateAsync(payload);
      parseApiSuccess<PrescriptionResponse>(response, t('encounters.prescriptionForm.error'));
      await invalidateEncounterQueries(queryClient);
      setItems([]);
      setNotes('');
      resetItemFields();
    } catch (error) {
      setActionError(notifyApiError(error, t('encounters.prescriptionForm.error')));
    }
  }

  return (
    <form noValidate className="space-y-3" onSubmit={(event) => void handleSubmit(event)}>
      {actionError ? (
        <p
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
        >
          {actionError}
        </p>
      ) : null}
      <CodeSearchPicker
        id="prescription-medication-search"
        label={t('encounters.prescriptionForm.medicationLabel')}
        placeholder={t('encounters.prescriptionForm.medicationSearch')}
        search={search}
        codes={medicationQuery.options}
        isPending={medicationQuery.isPending}
        isEnabled={medicationQuery.isEnabled}
        selected={selected}
        onSearchChange={setSearch}
        onSelect={setSelected}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div>
          <label
            htmlFor="prescription-dosage"
            className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
          >
            {t('encounters.prescriptionForm.dosage')}
          </label>
          <Input
            id="prescription-dosage"
            placeholder={t('encounters.prescriptionForm.dosagePlaceholder')}
            value={dosage}
            onChange={(event) => setDosage(event.target.value)}
          />
        </div>
        <div>
          <label
            htmlFor="prescription-frequency"
            className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
          >
            {t('encounters.prescriptionForm.frequency')}
          </label>
          <Input
            id="prescription-frequency"
            placeholder={t('encounters.prescriptionForm.frequencyPlaceholder')}
            value={frequency}
            onChange={(event) => setFrequency(event.target.value)}
          />
        </div>
        <div>
          <label
            htmlFor="prescription-duration"
            className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
          >
            {t('encounters.prescriptionForm.durationDays')}
          </label>
          <Input
            id="prescription-duration"
            type="number"
            min={1}
            max={365}
            value={durationDays}
            onChange={(event) => setDurationDays(event.target.value)}
          />
        </div>
        <div>
          <label
            htmlFor="prescription-quantity"
            className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
          >
            {t('encounters.prescriptionForm.quantity')}
          </label>
          <Input
            id="prescription-quantity"
            type="number"
            min={1}
            max={10000}
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </div>
      </div>
      <div className="flex items-end gap-3">
        <div className="min-w-48 flex-1">
          <label
            htmlFor="prescription-instructions"
            className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
          >
            {t('encounters.prescriptionForm.instructions')}
          </label>
          <Input
            id="prescription-instructions"
            placeholder={t('encounters.prescriptionForm.instructionsPlaceholder')}
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
          />
        </div>
        <Button type="button" size="sm" variant="outline" onClick={handleAddItem}>
          {t('encounters.prescriptionForm.addItem')}
        </Button>
      </div>
      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((item) => (
            <EncounterPrescriptionDraftRow
              key={item.medicationId}
              item={item}
              onRemove={handleRemoveItem}
            />
          ))}
        </ul>
      ) : null}
      <div className="flex items-end gap-3">
        <div className="min-w-48 flex-1">
          <label
            htmlFor="prescription-notes"
            className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
          >
            {t('encounters.notes')}
          </label>
          <Input
            id="prescription-notes"
            placeholder={t('encounters.prescriptionForm.notesPlaceholder')}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>
        <Button
          type="submit"
          size="sm"
          className="bg-primary-container hover:bg-primary"
          disabled={createMutation.isPending || items.length === 0}
        >
          {createMutation.isPending
            ? t('encounters.prescriptionForm.submitting')
            : t('encounters.prescriptionForm.submit')}
        </Button>
      </div>
    </form>
  );
}
