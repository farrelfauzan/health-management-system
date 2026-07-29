'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AddProcedureInput, ProcedureResponse } from '@hms/shared-types';
import { Button, Input } from '@hms/ui';

import { CodeSearchPicker } from '#components/client/encounters/code-search-picker';
import { encounterClinicalDataControllerAddProcedureV1 } from '#lib/api/generated/encounters/encounters';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import type { CodeSearchOption } from '#lib/encounters/code-search-option';
import { invalidateEncounterQueries } from '#lib/encounters/invalidate-encounter-queries';
import { useIcd9cmSearch } from '#lib/encounters/use-icd9cm-search';

const PROCEDURE_ERROR_FALLBACK = 'Unable to record the procedure. Please try again.';

type EncounterProcedureFormProps = {
  encounterId: string;
};

export function EncounterProcedureForm({ encounterId }: EncounterProcedureFormProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState<string>('');
  const [selected, setSelected] = useState<CodeSearchOption | null>(null);
  const [notes, setNotes] = useState<string>('');
  const [actionError, setActionError] = useState<string | null>(null);
  const icd9cmQuery = useIcd9cmSearch(search);
  const addMutation = useMutation({
    mutationFn: (payload: AddProcedureInput) =>
      encounterClinicalDataControllerAddProcedureV1(encounterId, payload),
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setActionError(null);

    if (!selected) {
      setActionError('Search the catalog and pick an ICD-9-CM code first.');
      return;
    }

    const trimmedNotes = notes.trim();
    const payload: AddProcedureInput = {
      icd9cmCodeId: selected.id,
      ...(trimmedNotes.length > 0 ? { notes: trimmedNotes } : {}),
    };

    try {
      const response = await addMutation.mutateAsync(payload);
      parseApiSuccess<ProcedureResponse>(response, PROCEDURE_ERROR_FALLBACK);
      await invalidateEncounterQueries(queryClient);
      setSelected(null);
      setSearch('');
      setNotes('');
    } catch (error) {
      setActionError(notifyApiError(error, PROCEDURE_ERROR_FALLBACK));
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
        id="procedure-code-search"
        label="ICD-9-CM Procedure"
        placeholder="Search by code or term, e.g. 93.57 or wound dressing"
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
          <label
            htmlFor="procedure-notes"
            className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
          >
            Notes
          </label>
          <Input
            id="procedure-notes"
            placeholder="Optional detail — site, quantity, findings"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>
        <Button
          type="submit"
          size="sm"
          className="bg-primary-container hover:bg-primary"
          disabled={addMutation.isPending}
        >
          {addMutation.isPending ? 'Adding...' : 'Add Procedure'}
        </Button>
      </div>
    </form>
  );
}
