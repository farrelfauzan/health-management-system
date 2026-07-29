'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DIAGNOSIS_TYPES, type AddDiagnosisInput, type DiagnosisResponse } from '@hms/shared-types';
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@hms/ui';

import { CodeSearchPicker } from '#components/client/encounters/code-search-picker';
import { encounterClinicalDataControllerAddDiagnosisV1 } from '#lib/api/generated/encounters/encounters';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import type { CodeSearchOption } from '#lib/encounters/code-search-option';
import { invalidateEncounterQueries } from '#lib/encounters/invalidate-encounter-queries';
import { useIcd10Search } from '#lib/encounters/use-icd10-search';
import { formatStatusLabel } from '#lib/shared/status-label';

const DIAGNOSIS_ERROR_FALLBACK = 'Unable to record the diagnosis. Please try again.';

type EncounterDiagnosisFormProps = {
  encounterId: string;
  hasPrimaryDiagnosis: boolean;
};

export function EncounterDiagnosisForm({
  encounterId,
  hasPrimaryDiagnosis,
}: EncounterDiagnosisFormProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState<string>('');
  const [selected, setSelected] = useState<CodeSearchOption | null>(null);
  const [type, setType] = useState<string>(hasPrimaryDiagnosis ? 'SECONDARY' : 'PRIMARY');
  const [notes, setNotes] = useState<string>('');
  const [actionError, setActionError] = useState<string | null>(null);
  const icd10Query = useIcd10Search(search);
  const addMutation = useMutation({
    mutationFn: (payload: AddDiagnosisInput) =>
      encounterClinicalDataControllerAddDiagnosisV1(encounterId, payload),
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setActionError(null);

    if (!selected) {
      setActionError('Search the catalog and pick an ICD-10 code first.');
      return;
    }

    const trimmedNotes = notes.trim();
    // The catalog row id is sent rather than the code and title: the server
    // snapshots them from the catalog, so a client can never sign a display
    // that disagrees with the code.
    const payload: AddDiagnosisInput = {
      icd10CodeId: selected.id,
      type: type as AddDiagnosisInput['type'],
      ...(trimmedNotes.length > 0 ? { notes: trimmedNotes } : {}),
    };

    try {
      const response = await addMutation.mutateAsync(payload);
      parseApiSuccess<DiagnosisResponse>(response, DIAGNOSIS_ERROR_FALLBACK);
      await invalidateEncounterQueries(queryClient);
      setSelected(null);
      setSearch('');
      setNotes('');
      setType('SECONDARY');
    } catch (error) {
      setActionError(notifyApiError(error, DIAGNOSIS_ERROR_FALLBACK));
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
        id="diagnosis-code-search"
        label="ICD-10 Diagnosis"
        placeholder="Search by code or term, e.g. J06 or common cold"
        search={search}
        codes={icd10Query.codes}
        isPending={icd10Query.isPending}
        isEnabled={icd10Query.isEnabled}
        selected={selected}
        onSearchChange={setSearch}
        onSelect={setSelected}
      />
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-40">
          <label
            htmlFor="diagnosis-type"
            className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
          >
            Type
          </label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger id="diagnosis-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DIAGNOSIS_TYPES.map((typeValue) => (
                <SelectItem key={typeValue} value={typeValue}>
                  {formatStatusLabel(typeValue)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-48 flex-1">
          <label
            htmlFor="diagnosis-notes"
            className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
          >
            Notes
          </label>
          <Input
            id="diagnosis-notes"
            placeholder="Optional clinical qualifier"
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
          {addMutation.isPending ? 'Adding...' : 'Add Diagnosis'}
        </Button>
      </div>
    </form>
  );
}
