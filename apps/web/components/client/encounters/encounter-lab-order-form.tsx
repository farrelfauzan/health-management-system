'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateLabOrderInput, LabOrderPriorityValue, LabOrderView } from '@hms/shared-types';
import { Button, Checkbox, Icon, Input } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { EncounterLabTestPicker } from '#components/client/encounters/encounter-lab-test-picker';
import { InlineNotice } from '#components/client/shared/inline-notice';
import { encounterLabOrderControllerCreateLabOrderV1 } from '#lib/api/generated/laboratory-orders/laboratory-orders';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateEncounterQueries } from '#lib/encounters/invalidate-encounter-queries';

type EncounterLabOrderFormProps = {
  encounterId: string;
};

/**
 * Asks the laboratory for work, from the screen the doctor is already writing
 * the note on (`P18-T07`).
 *
 * Cito and puasa are the two facts the bench cannot infer and the patient
 * cannot be asked later: an urgent request that sorts by arrival time is an
 * urgent request nobody sees, and a fasting sample drawn after lunch is a
 * sample drawn twice. The clinical note is the only free text the analis is
 * shown, and it is why they work a tube differently.
 */
export function EncounterLabOrderForm({ encounterId }: EncounterLabOrderFormProps) {
  const queryClient = useQueryClient();
  const t = useTranslations('clinical');
  const [testIds, setTestIds] = useState<string[]>([]);
  const [panelIds, setPanelIds] = useState<string[]>([]);
  const [priority, setPriority] = useState<LabOrderPriorityValue>('ROUTINE');
  const [isFasting, setIsFasting] = useState<boolean>(false);
  const [clinicalNotes, setClinicalNotes] = useState<string>('');
  const [actionError, setActionError] = useState<string | null>(null);
  const createMutation = useMutation({
    mutationFn: (payload: CreateLabOrderInput) =>
      encounterLabOrderControllerCreateLabOrderV1(encounterId, payload),
  });

  function resetForm(): void {
    setTestIds([]);
    setPanelIds([]);
    setPriority('ROUTINE');
    setIsFasting(false);
    setClinicalNotes('');
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setActionError(null);
    if (testIds.length === 0 && panelIds.length === 0) {
      setActionError(t('encounters.laboratory.form.pickSomething'));
      return;
    }
    const payload: CreateLabOrderInput = {
      ...(testIds.length > 0 ? { testIds } : {}),
      ...(panelIds.length > 0 ? { panelIds } : {}),
      priority,
      isFasting,
      ...(clinicalNotes.trim() ? { clinicalNotes: clinicalNotes.trim() } : {}),
    };
    try {
      const response = await createMutation.mutateAsync(payload);
      parseApiSuccess<LabOrderView>(response, t('encounters.laboratory.form.error'));
      await invalidateEncounterQueries(queryClient);
      resetForm();
    } catch (caughtError) {
      notifyApiError(caughtError, t('encounters.laboratory.form.error'));
    }
  }

  return (
    <form className="space-y-3 rounded-lg border border-slate-200 p-3" onSubmit={handleSubmit}>
      <EncounterLabTestPicker
        testIds={testIds}
        panelIds={panelIds}
        onTestIdsChange={setTestIds}
        onPanelIdsChange={setPanelIds}
        disabled={createMutation.isPending}
      />
      <Input
        value={clinicalNotes}
        onChange={(event) => setClinicalNotes(event.target.value)}
        placeholder={t('encounters.laboratory.form.notesPlaceholder')}
        disabled={createMutation.isPending}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <Checkbox
              checked={priority === 'URGENT'}
              onCheckedChange={(checked) => setPriority(checked === true ? 'URGENT' : 'ROUTINE')}
              disabled={createMutation.isPending}
            />
            {t('encounters.laboratory.form.urgent')}
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <Checkbox
              checked={isFasting}
              onCheckedChange={(checked) => setIsFasting(checked === true)}
              disabled={createMutation.isPending}
            />
            {t('encounters.laboratory.form.fasting')}
          </label>
        </div>
        <Button
          type="submit"
          className="bg-primary-container hover:bg-primary"
          disabled={createMutation.isPending}
        >
          <Icon name="labs" size={18} />
          {t('encounters.laboratory.form.submit')}
        </Button>
      </div>
      {actionError ? <InlineNotice tone="error">{actionError}</InlineNotice> : null}
    </form>
  );
}
