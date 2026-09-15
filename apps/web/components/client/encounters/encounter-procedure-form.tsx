'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  AddProcedureInput,
  ContraceptiveImplantActionValue,
  DoctorAuthorityKindValue,
  ProcedureResponse,
} from '@hms/shared-types';
import { Button, Input, Label } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { CodeSearchPicker } from '#components/client/encounters/code-search-picker';
import { EncounterImplantActionSelect } from '#components/client/encounters/encounter-implant-action-select';
import { MidwifeAuthorityRefusalNotice } from '#components/client/encounters/midwife-authority-refusal-notice';
import { InlineNotice } from '#components/client/shared/inline-notice';
import { encounterClinicalDataControllerAddProcedureV1 } from '#lib/api/generated/encounters/encounters';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import type { CodeSearchOption } from '#lib/encounters/code-search-option';
import { invalidateEncounterQueries } from '#lib/encounters/invalidate-encounter-queries';
import { resolveMidwifeAuthorityRefusalKind } from '#lib/encounters/resolve-midwife-authority-refusal-kind';
import { useIcd9cmSearch } from '#lib/encounters/use-icd9cm-search';

type EncounterProcedureFormProps = {
  encounterId: string;
};

export function EncounterProcedureForm({ encounterId }: EncounterProcedureFormProps) {
  const queryClient = useQueryClient();
  const t = useTranslations('clinical');
  const [search, setSearch] = useState<string>('');
  const [selected, setSelected] = useState<CodeSearchOption | null>(null);
  const [notes, setNotes] = useState<string>('');
  const [implantAction, setImplantAction] = useState<ContraceptiveImplantActionValue | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [refusedKind, setRefusedKind] = useState<DoctorAuthorityKindValue | null>(null);
  const icd9cmQuery = useIcd9cmSearch(search);
  const addMutation = useMutation({
    mutationFn: (payload: AddProcedureInput) =>
      encounterClinicalDataControllerAddProcedureV1(encounterId, payload),
  });

  function resetForm(): void {
    setSelected(null);
    setSearch('');
    setNotes('');
    setImplantAction(null);
  }

  function handleAddError(error: unknown): void {
    // P25-T03: a midwife without the authority is told which one and where to
    // refer, inline, instead of a generic failure toast.
    const kind = resolveMidwifeAuthorityRefusalKind(error);
    if (kind !== undefined) {
      setRefusedKind(kind);
      return;
    }
    setActionError(notifyApiError(error, t('encounters.procedure.error')));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setActionError(null);
    setRefusedKind(null);
    if (!selected) {
      setActionError(t('encounters.procedure.pick'));
      return;
    }
    const trimmedNotes = notes.trim();
    const payload: AddProcedureInput = {
      icd9cmCodeId: selected.id,
      ...(trimmedNotes.length > 0 ? { notes: trimmedNotes } : {}),
      ...(implantAction !== null ? { contraceptiveImplantAction: implantAction } : {}),
    };
    try {
      const response = await addMutation.mutateAsync(payload);
      parseApiSuccess<ProcedureResponse>(response, t('encounters.procedure.error'));
      await invalidateEncounterQueries(queryClient);
      resetForm();
    } catch (error) {
      handleAddError(error);
    }
  }

  return (
    <form noValidate className="space-y-3" onSubmit={(event) => void handleSubmit(event)}>
      {refusedKind ? <MidwifeAuthorityRefusalNotice kind={refusedKind} /> : null}
      {actionError ? <InlineNotice tone="error">{actionError}</InlineNotice> : null}
      <CodeSearchPicker
        id="procedure-code-search"
        label={t('encounters.procedure.label')}
        placeholder={t('encounters.procedure.search')}
        search={search}
        codes={icd9cmQuery.codes}
        isPending={icd9cmQuery.isPending}
        isEnabled={icd9cmQuery.isEnabled}
        selected={selected}
        onSearchChange={setSearch}
        onSelect={setSelected}
      />
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1">
          <Label
            htmlFor="procedure-notes"
            className="mb-1.5 font-heading text-xs text-slate-600"
          >
            {t('encounters.notes')}
          </Label>
          <Input
            id="procedure-notes"
            placeholder={t('encounters.procedure.notes')}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>
        <EncounterImplantActionSelect value={implantAction} onChange={setImplantAction} />
        <Button
          type="submit"
          size="sm"
          className="bg-primary-container hover:bg-primary"
          disabled={addMutation.isPending}
        >
          {addMutation.isPending ? t('encounters.adding') : t('encounters.procedure.add')}
        </Button>
      </div>
    </form>
  );
}
