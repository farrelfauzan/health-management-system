'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  IMMUNIZATION_REASONS,
  type AddImmunizationInput,
  type ImmunizationResponse,
} from '@hms/shared-types';
import {
  Button,
  Checkbox,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useAbility,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { InlineNotice } from '#components/client/shared/inline-notice';
import { LocalizedDatePicker } from '#components/client/shared/localized-date-picker';
import { encounterClinicalDataControllerAddImmunizationV1 } from '#lib/api/generated/encounters/encounters';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { buildImmunizationPayload } from '#lib/encounters/build-immunization-payload';
import { IMMUNIZATION_ROUTES, IMMUNIZATION_SITES } from '#lib/encounters/immunization-options';
import { invalidateEncounterQueries } from '#lib/encounters/invalidate-encounter-queries';
import { UNSPECIFIED_IMMUNIZATION_OPTION } from '#lib/encounters/unspecified-immunization-option';
import { useVaccineCatalog } from '#lib/encounters/use-vaccine-catalog';

type EncounterImmunizationFormProps = {
  encounterId: string;
};

/**
 * Records one vaccination (P10-T16, P24-T12). The vaccine, the reason and the
 * dose number are always required, because SATUSEHAT refuses an Immunization
 * without them. A dose given here also needs its lot number and expiry. A
 * dose copied from a card or KIA book is ticked "historical" and needs
 * neither, so nobody has to invent an expiry date to record what the book says.
 */
export function EncounterImmunizationForm({ encounterId }: EncounterImmunizationFormProps) {
  const queryClient = useQueryClient();
  const t = useTranslations('clinical');
  const [medicationId, setMedicationId] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [isHistorical, setIsHistorical] = useState<boolean>(false);
  const [lotNumber, setLotNumber] = useState<string>('');
  const [expirationDate, setExpirationDate] = useState<string>('');
  const [doseNumber, setDoseNumber] = useState<string>('');
  const [route, setRoute] = useState<string>(UNSPECIFIED_IMMUNIZATION_OPTION);
  const [site, setSite] = useState<string>(UNSPECIFIED_IMMUNIZATION_OPTION);
  const [actionError, setActionError] = useState<string | null>(null);
  const vaccineQuery = useVaccineCatalog();
  const canFlagVaccines = useAbility().can('update', 'Medication');
  const addMutation = useMutation({
    mutationFn: (payload: AddImmunizationInput) =>
      encounterClinicalDataControllerAddImmunizationV1(encounterId, payload),
  });
  const historicalCheckboxId = `immunization-historical-${encounterId}`;
  const batchSuffix = isHistorical ? '' : ' *';

  function resetForm(): void {
    setMedicationId('');
    setReason('');
    setIsHistorical(false);
    setLotNumber('');
    setExpirationDate('');
    setDoseNumber('');
    setRoute(UNSPECIFIED_IMMUNIZATION_OPTION);
    setSite(UNSPECIFIED_IMMUNIZATION_OPTION);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setActionError(null);
    const result = buildImmunizationPayload({
      medicationId,
      reason,
      isHistorical,
      lotNumber,
      expirationDate,
      doseNumber,
      route,
      site,
    });
    if (result.payload === null) {
      setActionError(t(result.errorKey));
      return;
    }
    try {
      const response = await addMutation.mutateAsync(result.payload);
      parseApiSuccess<ImmunizationResponse>(response, t('encounters.immunization.addError'));
      await invalidateEncounterQueries(queryClient);
      resetForm();
    } catch (error) {
      setActionError(notifyApiError(error, t('encounters.immunization.addError')));
    }
  }

  return (
    <form className="space-y-3" onSubmit={(event) => void handleSubmit(event)}>
      <Select value={medicationId} onValueChange={setMedicationId}>
        <SelectTrigger aria-label={t('encounters.immunization.vaccine')}>
          <SelectValue placeholder={t('encounters.immunization.vaccinePlaceholder')} />
        </SelectTrigger>
        <SelectContent>
          {vaccineQuery.vaccines.map((vaccine) => (
            <SelectItem key={vaccine.id} value={vaccine.id}>
              {vaccine.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!vaccineQuery.isPending && vaccineQuery.vaccines.length === 0 ? (
        // Not an error: a clinic that has not flagged any catalog row as a
        // vaccine simply cannot record one yet, and the fix is in the catalog —
        // which the doctors and midwives filling this form can only read.
        <p className="text-xs text-slate-500">
          {canFlagVaccines
            ? t('encounters.immunization.noVaccines')
            : t('encounters.immunization.noVaccinesAskAdministrator')}
        </p>
      ) : null}
      <Select value={reason} onValueChange={setReason}>
        <SelectTrigger aria-label={t('encounters.immunization.reason')}>
          <SelectValue placeholder={t('encounters.immunization.reasonPlaceholder')} />
        </SelectTrigger>
        <SelectContent>
          {IMMUNIZATION_REASONS.map((option) => (
            <SelectItem key={option} value={option}>
              {t(`encounters.immunization.reasons.${option}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Checkbox
            id={historicalCheckboxId}
            checked={isHistorical}
            onCheckedChange={(checked) => setIsHistorical(checked === true)}
          />
          <Label htmlFor={historicalCheckboxId} className="text-sm text-slate-700">
            {t('encounters.immunization.historical')}
          </Label>
        </div>
        <p className="text-xs text-slate-500">{t('encounters.immunization.historicalHint')}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Input
          placeholder={`${t('encounters.immunization.lotNumber')}${batchSuffix}`}
          aria-label={t('encounters.immunization.lotNumber')}
          aria-required={!isHistorical}
          value={lotNumber}
          onChange={(event) => setLotNumber(event.target.value)}
        />
        <LocalizedDatePicker
          aria-label={t('encounters.immunization.expirationDate')}
          placeholder={`${t('encounters.immunization.expirationDate')}${batchSuffix}`}
          value={expirationDate}
          onValueChange={setExpirationDate}
        />
        <Input
          type="number"
          min={1}
          placeholder={`${t('encounters.immunization.doseNumber')} *`}
          aria-label={t('encounters.immunization.doseNumber')}
          aria-required
          value={doseNumber}
          onChange={(event) => setDoseNumber(event.target.value)}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select value={route} onValueChange={setRoute}>
          <SelectTrigger aria-label={t('encounters.immunization.route')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNSPECIFIED_IMMUNIZATION_OPTION}>
              {t('encounters.immunization.route')}
            </SelectItem>
            {IMMUNIZATION_ROUTES.map((option) => (
              <SelectItem key={option} value={option}>
                {t(`encounters.immunization.routes.${option}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={site} onValueChange={setSite}>
          <SelectTrigger aria-label={t('encounters.immunization.site')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNSPECIFIED_IMMUNIZATION_OPTION}>
              {t('encounters.immunization.site')}
            </SelectItem>
            {IMMUNIZATION_SITES.map((option) => (
              <SelectItem key={option} value={option}>
                {t(`encounters.immunization.sites.${option}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {actionError ? <InlineNotice tone="error">{actionError}</InlineNotice> : null}
      <Button
        type="submit"
        size="sm"
        className="bg-primary-container hover:bg-primary"
        disabled={addMutation.isPending}
      >
        {addMutation.isPending ? t('common.saving') : t('encounters.immunization.add')}
      </Button>
    </form>
  );
}
