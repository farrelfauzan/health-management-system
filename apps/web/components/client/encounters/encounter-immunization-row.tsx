'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ImmunizationResponse } from '@hms/shared-types';
import { Icon } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { encounterClinicalDataControllerRemoveImmunizationV1 } from '#lib/api/generated/encounters/encounters';
import { notifyApiError } from '#lib/api/notify-api-error';
import { invalidateEncounterQueries } from '#lib/encounters/invalidate-encounter-queries';

type EncounterImmunizationRowProps = {
  encounterId: string;
  immunization: ImmunizationResponse;
  isEditable: boolean;
};

export function EncounterImmunizationRow({
  encounterId,
  immunization,
  isEditable,
}: EncounterImmunizationRowProps) {
  const queryClient = useQueryClient();
  const t = useTranslations('clinical');
  const format = useFormatter();
  const [actionError, setActionError] = useState<string | null>(null);
  const removeMutation = useMutation({
    mutationFn: () =>
      encounterClinicalDataControllerRemoveImmunizationV1(encounterId, immunization.id),
  });

  async function handleRemove(): Promise<void> {
    setActionError(null);
    try {
      await removeMutation.mutateAsync();
      await invalidateEncounterQueries(queryClient);
    } catch (error) {
      setActionError(notifyApiError(error, t('encounters.immunization.retractError')));
    }
  }

  const details = [
    immunization.doseNumber
      ? t('encounters.immunization.dose', { number: immunization.doseNumber })
      : null,
    immunization.lotNumber ? `Lot ${immunization.lotNumber}` : null,
    immunization.route ? t(`encounters.immunization.routes.${immunization.route}`) : null,
    immunization.site ? t(`encounters.immunization.sites.${immunization.site}`) : null,
  ].filter((detail): detail is string => detail !== null);

  return (
    <li className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
      <div>
        <p className="text-sm font-medium text-slate-900">{immunization.medicationName}</p>
        <p className="text-xs text-slate-500">
          {format.dateTime(new Date(immunization.occurredAt), {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}
          {details.length > 0 ? ` · ${details.join(' · ')}` : null}
        </p>
        {immunization.kfaCode ? null : (
          // Worth saying on the row: the vaccination is recorded either way,
          // but without a KFA code it never reaches the national record.
          <p className="text-xs text-amber-700">{t('encounters.immunization.noKfa')}</p>
        )}
        {actionError ? (
          <p role="alert" className="text-xs text-rose-600">
            {actionError}
          </p>
        ) : null}
      </div>
      {isEditable ? (
        <button
          type="button"
          aria-label={t('encounters.immunization.retract', {
            vaccine: immunization.medicationName,
          })}
          className="text-slate-400 hover:text-danger disabled:opacity-50"
          disabled={removeMutation.isPending}
          onClick={() => void handleRemove()}
        >
          <Icon name="delete" size={16} />
        </button>
      ) : null}
    </li>
  );
}
