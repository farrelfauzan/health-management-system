'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  AddImmunizationInput,
  ImmunizationResponse,
  ImmunizationRouteValue,
  ImmunizationSiteValue,
} from '@hms/shared-types';
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { encounterClinicalDataControllerAddImmunizationV1 } from '#lib/api/generated/encounters/encounters';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import {
  IMMUNIZATION_ROUTES,
  IMMUNIZATION_SITES,
} from '#lib/encounters/immunization-options';
import { invalidateEncounterQueries } from '#lib/encounters/invalidate-encounter-queries';
import { useVaccineCatalog } from '#lib/encounters/use-vaccine-catalog';

const UNSPECIFIED = 'UNSPECIFIED';

type EncounterImmunizationFormProps = {
  encounterId: string;
};

/**
 * Records one vaccination. Only the vaccine is required: a doctor recording a
 * dose from a patient's card may not have the lot, the expiry or the dose
 * number, and a record with what they do have is worth more than no record —
 * the SATUSEHAT mapper omits what is absent rather than inventing it.
 */
export function EncounterImmunizationForm({ encounterId }: EncounterImmunizationFormProps) {
  const queryClient = useQueryClient();
  const t = useTranslations('clinical');
  const [medicationId, setMedicationId] = useState<string>('');
  const [lotNumber, setLotNumber] = useState<string>('');
  const [expirationDate, setExpirationDate] = useState<string>('');
  const [doseNumber, setDoseNumber] = useState<string>('');
  const [route, setRoute] = useState<string>(UNSPECIFIED);
  const [site, setSite] = useState<string>(UNSPECIFIED);
  const [actionError, setActionError] = useState<string | null>(null);
  const vaccineQuery = useVaccineCatalog();
  const addMutation = useMutation({
    mutationFn: (payload: AddImmunizationInput) =>
      encounterClinicalDataControllerAddImmunizationV1(encounterId, payload),
  });

  function resetForm(): void {
    setMedicationId('');
    setLotNumber('');
    setExpirationDate('');
    setDoseNumber('');
    setRoute(UNSPECIFIED);
    setSite(UNSPECIFIED);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setActionError(null);

    if (!medicationId) {
      setActionError(t('encounters.immunization.pick'));
      return;
    }

    const payload: AddImmunizationInput = {
      medicationId,
      ...(lotNumber.trim() ? { lotNumber: lotNumber.trim() } : {}),
      ...(expirationDate ? { expirationDate } : {}),
      ...(doseNumber ? { doseNumber: Number(doseNumber) } : {}),
      ...(route === UNSPECIFIED ? {} : { route: route as ImmunizationRouteValue }),
      ...(site === UNSPECIFIED ? {} : { site: site as ImmunizationSiteValue }),
    };

    try {
      const response = await addMutation.mutateAsync(payload);
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
        // vaccine simply cannot record one yet, and the fix is in the catalog.
        <p className="text-xs text-slate-500">{t('encounters.immunization.noVaccines')}</p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <Input
          placeholder={t('encounters.immunization.lotNumber')}
          aria-label={t('encounters.immunization.lotNumber')}
          value={lotNumber}
          onChange={(event) => setLotNumber(event.target.value)}
        />
        <Input
          type="date"
          aria-label={t('encounters.immunization.expirationDate')}
          value={expirationDate}
          onChange={(event) => setExpirationDate(event.target.value)}
        />
        <Input
          type="number"
          min={1}
          placeholder={t('encounters.immunization.doseNumber')}
          aria-label={t('encounters.immunization.doseNumber')}
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
            <SelectItem value={UNSPECIFIED}>{t('encounters.immunization.route')}</SelectItem>
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
            <SelectItem value={UNSPECIFIED}>{t('encounters.immunization.site')}</SelectItem>
            {IMMUNIZATION_SITES.map((option) => (
              <SelectItem key={option} value={option}>
                {t(`encounters.immunization.sites.${option}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {actionError ? (
        <p role="alert" className="text-xs text-rose-600">
          {actionError}
        </p>
      ) : null}
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
