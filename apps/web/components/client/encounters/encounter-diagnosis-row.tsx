'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DiagnosisResponse } from '@hms/shared-types';
import { Badge, Icon } from '@hms/ui';

import { encounterClinicalDataControllerRemoveDiagnosisV1 } from '#lib/api/generated/encounters/encounters';
import { notifyApiError } from '#lib/api/notify-api-error';
import { invalidateEncounterQueries } from '#lib/encounters/invalidate-encounter-queries';

const RETRACT_ERROR_FALLBACK = 'Unable to retract the diagnosis. Please try again.';

type EncounterDiagnosisRowProps = {
  encounterId: string;
  diagnosis: DiagnosisResponse;
  isEditable: boolean;
};

export function EncounterDiagnosisRow({
  encounterId,
  diagnosis,
  isEditable,
}: EncounterDiagnosisRowProps) {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const isPrimary = diagnosis.type === 'PRIMARY';
  const removeMutation = useMutation({
    mutationFn: () => encounterClinicalDataControllerRemoveDiagnosisV1(encounterId, diagnosis.id),
  });

  async function handleRemove(): Promise<void> {
    setActionError(null);
    try {
      await removeMutation.mutateAsync();
      await invalidateEncounterQueries(queryClient);
    } catch (error) {
      setActionError(notifyApiError(error, RETRACT_ERROR_FALLBACK));
    }
  }

  return (
    <li className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
      <div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium text-slate-900">{diagnosis.code}</span>
          <Badge
            className={
              isPrimary
                ? 'rounded-full border-transparent bg-primary/10 text-[11px] text-primary'
                : 'rounded-full border-transparent bg-slate-100 text-[11px] text-slate-600'
            }
          >
            {isPrimary ? 'PRIMARY' : 'SECONDARY'}
          </Badge>
        </div>
        <p className="text-sm text-slate-700">{diagnosis.display}</p>
        {diagnosis.notes ? <p className="text-xs text-slate-500">{diagnosis.notes}</p> : null}
        {actionError ? (
          <p role="alert" className="text-xs text-rose-600">
            {actionError}
          </p>
        ) : null}
      </div>
      {isEditable ? (
        <button
          type="button"
          aria-label={`Retract diagnosis ${diagnosis.code}`}
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
