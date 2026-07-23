'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createDispenseSchema,
  type DispenseRecordResponse,
  type PrescriptionResponse,
} from '@hms/shared-types';
import { Button, Can, Card, CardContent, Icon } from '@hms/ui';

import { PrescriptionItemCard } from '#components/client/pharmacy/prescription-item-card';
import { VerificationChecklist } from '#components/client/pharmacy/verification-checklist';
import { AvatarInitials } from '#components/shared/avatar-initials';
import { dispenseControllerCreateDispenseV1 } from '#lib/api/generated/pharmacy-flow/pharmacy-flow';
import type { CreateDispenseDto } from '#lib/api/generated/model/createDispenseDto';
import { parseApiSuccess } from '#lib/api/response';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { formatIssuedAt } from '#lib/pharmacy/format-issued-at';
import { formatRxNumber } from '#lib/pharmacy/format-rx-number';
import { invalidatePharmacyQueries } from '#lib/pharmacy/invalidate-pharmacy-queries';
import { MOCK_CLINICAL_FLAGS } from '#lib/pharmacy/mock-clinical-flags';
import { VERIFICATION_STEPS } from '#lib/pharmacy/verification-steps';

const DISPENSE_ERROR_FALLBACK = 'Unable to dispense the prescription. Please try again.';

type PrescriptionDetailsPanelProps = {
  prescription: PrescriptionResponse | null;
  onDispensed: (message: string) => void;
};

export function PrescriptionDetailsPanel({
  prescription,
  onDispensed,
}: PrescriptionDetailsPanelProps) {
  const queryClient = useQueryClient();
  const [checkedStepIds, setCheckedStepIds] = useState<string[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const dispenseMutation = useMutation({
    mutationFn: (payload: CreateDispenseDto) => dispenseControllerCreateDispenseV1(payload),
  });
  const isChecklistComplete = VERIFICATION_STEPS.every((step) => checkedStepIds.includes(step.id));

  function handleToggleStep(stepId: string): void {
    setCheckedStepIds((currentIds) =>
      currentIds.includes(stepId)
        ? currentIds.filter((id) => id !== stepId)
        : [...currentIds, stepId],
    );
  }

  async function handleDispense(): Promise<void> {
    if (!prescription) {
      return;
    }
    setActionError(null);
    const parsed = createDispenseSchema.safeParse({
      prescriptionId: prescription.id,
      items: prescription.items.map((item) => ({
        medicationId: item.medicationId,
        quantity: item.quantity,
      })),
    });
    if (!parsed.success) {
      setActionError(parsed.error.issues[0]?.message ?? DISPENSE_ERROR_FALLBACK);
      return;
    }
    try {
      const response = await dispenseMutation.mutateAsync(parsed.data);
      parseApiSuccess<DispenseRecordResponse>(response, DISPENSE_ERROR_FALLBACK);
      await invalidatePharmacyQueries(queryClient);
      onDispensed(`${formatRxNumber(prescription.id)} dispensed successfully.`);
    } catch (error) {
      setActionError(resolveApiErrorMessage(error, DISPENSE_ERROR_FALLBACK));
    }
  }

  if (!prescription) {
    return (
      <Card className="rounded-xl border-slate-200 py-0 shadow-none">
        <CardContent className="flex flex-col items-center justify-center gap-2 p-10 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <Icon name="prescriptions" size={22} />
          </span>
          <p className="font-heading text-sm font-semibold text-slate-900">Select a prescription</p>
          <p className="max-w-sm text-sm text-slate-500">
            Choose a prescription from the queue to review its details and dispense it.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="gap-0 rounded-xl border-slate-200 py-0 shadow-none">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
        <h2 className="font-heading text-base font-semibold text-slate-900">
          Prescription Details
        </h2>
        <span className="font-mono text-sm font-semibold text-primary">
          {formatRxNumber(prescription.id)}
        </span>
      </div>
      <CardContent className="space-y-6 p-5">
        <div className="flex items-start gap-4">
          <AvatarInitials name={prescription.patient.fullName} size="lg" />
          <div className="min-w-0 space-y-0.5">
            <p className="font-heading text-base font-semibold text-slate-900">
              {prescription.patient.fullName}
            </p>
            <p className="font-mono text-xs text-slate-500">MRN #{prescription.patient.mrn}</p>
            <p className="text-sm text-slate-500">
              Prescribed by {prescription.doctor.fullName} · {formatIssuedAt(prescription.issuedAt)}
            </p>
            <p className="text-sm text-slate-500">
              Allergies:{' '}
              <span className="font-semibold text-danger">
                {MOCK_CLINICAL_FLAGS.allergies.join(', ')}
              </span>
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-danger/10 bg-danger-tint p-4">
          <p className="flex items-center gap-2 font-heading text-sm font-semibold text-danger">
            <Icon name="warning" size={18} />
            {MOCK_CLINICAL_FLAGS.interactionAlert.title}
          </p>
          <p className="mt-1.5 text-xs text-slate-700">
            {MOCK_CLINICAL_FLAGS.interactionAlert.message}
          </p>
        </div>

        <div className="space-y-3">
          {prescription.items.map((item) => (
            <PrescriptionItemCard key={item.id} item={item} />
          ))}
        </div>

        {prescription.notes ? (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {prescription.notes}
          </p>
        ) : null}

        <VerificationChecklist
          steps={VERIFICATION_STEPS}
          checkedStepIds={checkedStepIds}
          onToggleStep={handleToggleStep}
          isDisabled={dispenseMutation.isPending}
        />

        {actionError ? (
          <p
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
          >
            {actionError}
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-4">
          <Button
            type="button"
            variant="outline"
            className="h-auto flex-col gap-2 rounded-xl py-4"
            onClick={() => window.print()}
          >
            <Icon name="print" size={20} />
            Print Label
          </Button>
          <Can action="write" subject="DispenseRecord">
            <Button
              type="button"
              className="h-auto flex-col gap-2 rounded-xl bg-primary-container py-4 hover:bg-primary"
              disabled={!isChecklistComplete || dispenseMutation.isPending}
              onClick={() => void handleDispense()}
            >
              <Icon name="check_circle" size={20} />
              {dispenseMutation.isPending ? 'Dispensing…' : 'Dispense Now'}
            </Button>
          </Can>
        </div>
      </CardContent>
    </Card>
  );
}
