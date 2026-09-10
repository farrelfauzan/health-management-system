'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type {
  CreateWalkInLabOrderInput,
  LabOrderPriorityValue,
  LabOrderView,
} from '@hms/shared-types';
import { Button, Card, CardContent, Checkbox, Icon, Input, Label, toast } from '@hms/ui';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { EncounterLabTestPicker } from '#components/client/encounters/encounter-lab-test-picker';
import { LabIntakePatientPicker } from '#components/client/laboratory/lab-intake-patient-picker';
import { LabIntakeSourceChoice } from '#components/client/laboratory/lab-intake-source-choice';
import { InlineNotice } from '#components/client/shared/inline-notice';
import type { LabIntakePatient } from '#lib/laboratory/lab-intake-patient';
import { labOrderControllerCreateWalkInLabOrderV1 } from '#lib/api/generated/laboratory-orders/laboratory-orders';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';

type LabIntakeSource = 'WALK_IN' | 'EXTERNAL_REFERRAL';

/**
 * The front desk's screen for a patient who came only for a test (P18-T10):
 * one form that opens the visit and raises the order together.
 *
 * The source is asked first and explicitly, because it is the fact everything
 * downstream depends on — a referral has a doctor who must be named on the
 * sheet the result goes back on, and a walk-in has nobody, which the report
 * says rather than quietly crediting the clinic.
 */
export function LabIntakeWorkspace() {
  const t = useTranslations('operations.laboratory.intake');
  const router = useRouter();
  const [patient, setPatient] = useState<LabIntakePatient | null>(null);
  const [source, setSource] = useState<LabIntakeSource>('WALK_IN');
  const [requesterName, setRequesterName] = useState<string>('');
  const [requesterFacility, setRequesterFacility] = useState<string>('');
  const [testIds, setTestIds] = useState<string[]>([]);
  const [panelIds, setPanelIds] = useState<string[]>([]);
  const [priority, setPriority] = useState<LabOrderPriorityValue>('ROUTINE');
  const [isFasting, setIsFasting] = useState<boolean>(false);
  const [clinicalNotes, setClinicalNotes] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const createMutation = useMutation({
    mutationFn: (payload: CreateWalkInLabOrderInput) =>
      labOrderControllerCreateWalkInLabOrderV1(payload),
  });

  function resolveValidationError(): string | null {
    if (!patient) {
      return t('pickPatient');
    }
    if (testIds.length === 0 && panelIds.length === 0) {
      return t('pickSomething');
    }
    if (source === 'EXTERNAL_REFERRAL' && requesterName.trim().length === 0) {
      return t('requester.required');
    }
    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const validationError = resolveValidationError();
    setFormError(validationError);
    if (validationError !== null || !patient) {
      return;
    }
    const isReferral = source === 'EXTERNAL_REFERRAL';
    const payload: CreateWalkInLabOrderInput = {
      patientId: patient.id,
      source,
      ...(testIds.length > 0 ? { testIds } : {}),
      ...(panelIds.length > 0 ? { panelIds } : {}),
      priority,
      isFasting,
      ...(clinicalNotes.trim() ? { clinicalNotes: clinicalNotes.trim() } : {}),
      ...(isReferral ? { externalRequesterName: requesterName.trim() } : {}),
      ...(isReferral && requesterFacility.trim()
        ? { externalRequesterFacility: requesterFacility.trim() }
        : {}),
    };
    try {
      const response = await createMutation.mutateAsync(payload);
      const { data: order } = parseApiSuccess<LabOrderView>(response, t('error'));
      toast.success(t('success', { orderNumber: order.orderNumber }));
      // Straight to the order the bench will work from, so the label can be
      // printed without hunting for it in the worklist.
      router.push(`/admin/laboratory/${order.id}`);
    } catch (caughtError) {
      notifyApiError(caughtError, t('error'));
    }
  }

  const isBusy = createMutation.isPending;

  return (
    <Card>
      <CardContent className="pt-6">
        <form className="space-y-6" onSubmit={handleSubmit}>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-900">{t('patient.legend')}</legend>
            <LabIntakePatientPicker
              selectedPatient={patient}
              onSelect={setPatient}
              disabled={isBusy}
            />
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-900">{t('source.legend')}</legend>
            <LabIntakeSourceChoice value={source} onChange={setSource} disabled={isBusy} />
          </fieldset>

          {source === 'EXTERNAL_REFERRAL' ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-slate-900">
                {t('requester.legend')}
              </legend>
              <Input
                value={requesterName}
                onChange={(event) => setRequesterName(event.target.value)}
                placeholder={t('requester.namePlaceholder')}
                aria-label={t('requester.nameLabel')}
                disabled={isBusy}
              />
              <Input
                value={requesterFacility}
                onChange={(event) => setRequesterFacility(event.target.value)}
                placeholder={t('requester.facilityPlaceholder')}
                aria-label={t('requester.facilityLabel')}
                disabled={isBusy}
              />
            </fieldset>
          ) : null}

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-900">{t('tests.legend')}</legend>
            <EncounterLabTestPicker
              testIds={testIds}
              panelIds={panelIds}
              onTestIdsChange={setTestIds}
              onPanelIdsChange={setPanelIds}
              disabled={isBusy}
            />
          </fieldset>

          <Input
            value={clinicalNotes}
            onChange={(event) => setClinicalNotes(event.target.value)}
            placeholder={t('notesPlaceholder')}
            disabled={isBusy}
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4">
              <Label className="flex items-center gap-2 text-sm text-slate-700 font-normal">
                <Checkbox
                  checked={priority === 'URGENT'}
                  onCheckedChange={(checked) =>
                    setPriority(checked === true ? 'URGENT' : 'ROUTINE')
                  }
                  disabled={isBusy}
                />
                {t('urgent')}
              </Label>
              <Label className="flex items-center gap-2 text-sm text-slate-700 font-normal">
                <Checkbox
                  checked={isFasting}
                  onCheckedChange={(checked) => setIsFasting(checked === true)}
                  disabled={isBusy}
                />
                {t('fasting')}
              </Label>
            </div>
            <Button
              type="submit"
              className="bg-primary-container hover:bg-primary"
              disabled={isBusy}
            >
              <Icon name="labs" size={18} />
              {t('submit')}
            </Button>
          </div>
          {formError ? <InlineNotice tone="error">{formError}</InlineNotice> : null}
        </form>
      </CardContent>
    </Card>
  );
}
