'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ProcedureResponse } from '@hms/shared-types';
import { Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { encounterClinicalDataControllerRemoveProcedureV1 } from '#lib/api/generated/encounters/encounters';
import { notifyApiError } from '#lib/api/notify-api-error';
import { invalidateEncounterQueries } from '#lib/encounters/invalidate-encounter-queries';

type EncounterProcedureRowProps = {
  encounterId: string;
  procedure: ProcedureResponse;
  isEditable: boolean;
};

export function EncounterProcedureRow({
  encounterId,
  procedure,
  isEditable,
}: EncounterProcedureRowProps) {
  const queryClient = useQueryClient();
  const t = useTranslations('clinical');
  const [actionError, setActionError] = useState<string | null>(null);
  const removeMutation = useMutation({
    mutationFn: () => encounterClinicalDataControllerRemoveProcedureV1(encounterId, procedure.id),
  });

  async function handleRemove(): Promise<void> {
    setActionError(null);
    try {
      await removeMutation.mutateAsync();
      await invalidateEncounterQueries(queryClient);
    } catch (error) {
      setActionError(notifyApiError(error, t('encounters.procedure.retractError')));
    }
  }

  return (
    <li className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
      <div>
        <span className="font-mono text-sm font-medium text-slate-900">{procedure.code}</span>
        <p className="text-sm text-slate-700">{procedure.display}</p>
        {procedure.notes ? <p className="text-xs text-slate-500">{procedure.notes}</p> : null}
        {actionError ? (
          <p role="alert" className="text-xs text-rose-600">
            {actionError}
          </p>
        ) : null}
      </div>
      {isEditable ? (
        <button
          type="button"
          aria-label={t('encounters.procedure.retract', { code: procedure.code })}
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
