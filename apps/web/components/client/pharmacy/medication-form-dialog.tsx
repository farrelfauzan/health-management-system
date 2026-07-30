'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MEDICATION_CATEGORIES,
  MEDICATION_UNITS,
  type MedicationCategoryValue,
  type MedicationResponse,
  type MedicationUnitValue,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@hms/ui';
import { useLocale, useTranslations } from 'next-intl';

import {
  medicationControllerCreateMedicationV1,
  medicationControllerUpdateMedicationV1,
} from '#lib/api/generated/pharmacy-flow/pharmacy-flow';
import type { CreateMedicationDto } from '#lib/api/generated/model/createMedicationDto';
import type { UpdateMedicationDto } from '#lib/api/generated/model/updateMedicationDto';
import { parseApiSuccess } from '#lib/api/response';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { invalidatePharmacyQueries } from '#lib/pharmacy/invalidate-pharmacy-queries';
import { formatStatusLabel } from '#lib/shared/status-label';

type MedicationFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  medication: MedicationResponse | null;
  onSaved: (message: string) => void;
};

export function MedicationFormDialog({
  open,
  onOpenChange,
  medication,
  onSaved,
}: MedicationFormDialogProps) {
  const t = useTranslations('pharmacyInventory');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [code, setCode] = useState(medication?.code ?? '');
  const [kfaCode, setKfaCode] = useState(medication?.kfaCode ?? '');
  const [name, setName] = useState(medication?.name ?? '');
  const [form, setForm] = useState(medication?.form ?? '');
  const [strength, setStrength] = useState(medication?.strength ?? '');
  const [unit, setUnit] = useState<MedicationUnitValue>(medication?.unit ?? 'TABLET');
  const [category, setCategory] = useState<MedicationCategoryValue>(
    medication?.category ?? 'OBAT_BEBAS',
  );
  const [reorderLevel, setReorderLevel] = useState(String(medication?.reorderLevel ?? 0));
  const [error, setError] = useState<string | null>(null);
  const saveMutation = useMutation({
    mutationFn: (payload: CreateMedicationDto | UpdateMedicationDto) =>
      medication
        ? medicationControllerUpdateMedicationV1(medication.id, payload as UpdateMedicationDto)
        : medicationControllerCreateMedicationV1(payload as CreateMedicationDto),
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    const level = Number(reorderLevel);
    if (code.trim().length < 2 || name.trim().length < 2 || !Number.isInteger(level) || level < 0) {
      setError(t('requiredFields'));
      return;
    }

    const payload = {
      code: code.trim(),
      kfaCode: kfaCode.trim() || (medication ? null : undefined),
      name: name.trim(),
      form: form.trim() || (medication ? null : undefined),
      strength: strength.trim() || (medication ? null : undefined),
      unit,
      category,
      reorderLevel: level,
    } satisfies CreateMedicationDto | UpdateMedicationDto;

    try {
      const response = await saveMutation.mutateAsync(payload);
      parseApiSuccess<MedicationResponse>(response, t('saveError'));
      await invalidatePharmacyQueries(queryClient);
      onSaved(t('medicationSaved'));
      onOpenChange(false);
    } catch (cause) {
      setError(resolveApiErrorMessage(cause, t('saveError')));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <form noValidate onSubmit={(event) => void handleSubmit(event)}>
          <DialogHeader>
            <DialogTitle>{medication ? t('editMedication') : t('addMedication')}</DialogTitle>
            <DialogDescription>{t('noAbsoluteStock')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-5 sm:grid-cols-2">
            {error ? <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 sm:col-span-2">{error}</p> : null}
            <label className="space-y-1.5 text-sm">{t('code')}<Input value={code} onChange={(event) => setCode(event.target.value)} /></label>
            <label className="space-y-1.5 text-sm">{t('kfaCode')}<Input inputMode="numeric" value={kfaCode} onChange={(event) => setKfaCode(event.target.value)} /></label>
            <label className="space-y-1.5 text-sm sm:col-span-2">{t('name')}<Input value={name} onChange={(event) => setName(event.target.value)} /></label>
            <label className="space-y-1.5 text-sm">{t('form')}<Input value={form} onChange={(event) => setForm(event.target.value)} /></label>
            <label className="space-y-1.5 text-sm">{t('strength')}<Input value={strength} onChange={(event) => setStrength(event.target.value)} /></label>
            <label className="space-y-1.5 text-sm">{t('unit')}<Select value={unit} onValueChange={(value) => setUnit(value as MedicationUnitValue)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{MEDICATION_UNITS.map((value) => <SelectItem key={value} value={value}>{formatStatusLabel(value, locale)}</SelectItem>)}</SelectContent></Select></label>
            <label className="space-y-1.5 text-sm">{t('category')}<Select value={category} onValueChange={(value) => setCategory(value as MedicationCategoryValue)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{MEDICATION_CATEGORIES.map((value) => <SelectItem key={value} value={value}>{formatStatusLabel(value, locale)}</SelectItem>)}</SelectContent></Select></label>
            <label className="space-y-1.5 text-sm sm:col-span-2">{t('reorderLevel')}<Input type="number" min="0" max="1000000" value={reorderLevel} onChange={(event) => setReorderLevel(event.target.value)} /></label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('cancel')}</Button>
            <Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? t('saving') : t('saveMedication')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
