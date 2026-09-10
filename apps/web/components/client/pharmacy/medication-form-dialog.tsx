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
  Checkbox,
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

import { FieldDescription } from '#components/client/shared/field-description';
import { FormLabel } from '#components/client/shared/form-label';
import { InlineNotice } from '#components/client/shared/inline-notice';
import { LabelInfoTooltip } from '#components/client/shared/label-info-tooltip';
import { RequiredLegend } from '#components/client/shared/required-legend';
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
  const [isVaccine, setIsVaccine] = useState<boolean>(medication?.isVaccine ?? false);
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
      isVaccine,
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
            <RequiredLegend className="sm:col-span-2" />
            {error ? (
              <InlineNotice tone="error" className="sm:col-span-2">
                {error}
              </InlineNotice>
            ) : null}
            <div className="space-y-1.5">
              <FormLabel htmlFor="medication-code" required>
                {t('code')}
              </FormLabel>
              <Input
                id="medication-code"
                aria-describedby="medication-code-description"
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
              <FieldDescription id="medication-code-description">
                {t('codeDescription')}
              </FieldDescription>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <FormLabel htmlFor="medication-kfa-code">{t('kfaCode')}</FormLabel>
                <LabelInfoTooltip field={t('kfaCode')}>{t('kfaCodeTooltip')}</LabelInfoTooltip>
              </div>
              <Input
                id="medication-kfa-code"
                inputMode="numeric"
                value={kfaCode}
                onChange={(event) => setKfaCode(event.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <FormLabel htmlFor="medication-name" required>
                {t('name')}
              </FormLabel>
              <Input
                id="medication-name"
                placeholder={t('namePlaceholder')}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <FormLabel htmlFor="medication-form">{t('form')}</FormLabel>
              <Input
                id="medication-form"
                placeholder={t('formPlaceholder')}
                value={form}
                onChange={(event) => setForm(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <FormLabel htmlFor="medication-strength">{t('strength')}</FormLabel>
              <Input
                id="medication-strength"
                placeholder={t('strengthPlaceholder')}
                value={strength}
                onChange={(event) => setStrength(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <FormLabel htmlFor="medication-unit">{t('unit')}</FormLabel>
              <Select value={unit} onValueChange={(value) => setUnit(value as MedicationUnitValue)}>
                <SelectTrigger id="medication-unit" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEDICATION_UNITS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {formatStatusLabel(value, locale)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <FormLabel htmlFor="medication-category">{t('category')}</FormLabel>
              <Select
                value={category}
                onValueChange={(value) => setCategory(value as MedicationCategoryValue)}
              >
                <SelectTrigger id="medication-category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEDICATION_CATEGORIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {formatStatusLabel(value, locale)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <FormLabel htmlFor="medication-reorder-level">{t('reorderLevel')}</FormLabel>
              <Input
                id="medication-reorder-level"
                type="number"
                min="0"
                max="1000000"
                aria-describedby="medication-reorder-level-description"
                value={reorderLevel}
                onChange={(event) => setReorderLevel(event.target.value)}
              />
              <FieldDescription id="medication-reorder-level-description">
                {t('reorderLevelDescription')}
              </FieldDescription>
            </div>
            {/* P10-T16. The flag is what filters the immunisation picker on
                the encounter: a catalog row nobody marks here cannot be
                recorded as a vaccination at all. */}
            <div className="space-y-1.5 sm:col-span-2">
              <FormLabel className="flex items-center gap-2 text-sm font-normal">
                <Checkbox
                  aria-describedby="medication-is-vaccine-description"
                  checked={isVaccine}
                  onCheckedChange={(value) => setIsVaccine(value === true)}
                />
                {t('isVaccine')}
              </FormLabel>
              <FieldDescription id="medication-is-vaccine-description" className="pl-6">
                {t('isVaccineDescription')}
              </FieldDescription>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? t('saving') : t('saveMedication')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
