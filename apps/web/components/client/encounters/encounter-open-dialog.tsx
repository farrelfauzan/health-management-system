'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { EncounterListItem, OpenEncounterInput, RegistrationListItem } from '@hms/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@hms/ui';
import { useRouter } from 'next/navigation';

import { DoctorCombobox } from '#components/client/doctors/doctor-combobox';
import { encounterControllerOpenEncounterV1 } from '#lib/api/generated/encounters/encounters';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { useDoctorsList } from '#lib/doctors/use-doctors-list';
import { invalidateEncounterQueries } from '#lib/encounters/invalidate-encounter-queries';

const OPEN_ERROR_FALLBACK = 'Unable to open the encounter. Please try again.';
const DOCTOR_PICKER_QUERY = { page: 1, limit: 100, isActive: 'true' as const };

type EncounterOpenDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  registration: RegistrationListItem;
};

export function EncounterOpenDialog({
  open,
  onOpenChange,
  registration,
}: EncounterOpenDialogProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  // A registration made from an appointment already names the practitioner;
  // a walk-in does not, and the API refuses to guess for an admin actor.
  const [doctorId, setDoctorId] = useState<string>(registration.appointment?.doctor.id ?? '');
  const [actionError, setActionError] = useState<string | null>(null);
  const doctorsQuery = useDoctorsList(DOCTOR_PICKER_QUERY);
  const openMutation = useMutation({
    mutationFn: (payload: OpenEncounterInput) => encounterControllerOpenEncounterV1(payload),
  });

  async function handleConfirm(): Promise<void> {
    setActionError(null);

    if (doctorId.length === 0) {
      setActionError('Select the attending doctor for this visit.');
      return;
    }

    try {
      const response = await openMutation.mutateAsync({
        registrationId: registration.id,
        doctorId,
      });
      const envelope = parseApiSuccess<EncounterListItem>(response, OPEN_ERROR_FALLBACK);
      await invalidateEncounterQueries(queryClient);
      onOpenChange(false);
      router.push(`/admin/encounters/${envelope.data.id}`);
    } catch (error) {
      setActionError(notifyApiError(error, OPEN_ERROR_FALLBACK));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Open Encounter</DialogTitle>
          <DialogDescription>
            Start the clinical record for {registration.patient.fullName}. One encounter per
            registration — closing it completes the registration.
          </DialogDescription>
        </DialogHeader>
        <div>
          <label
            htmlFor="open-encounter-doctor"
            className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
          >
            Attending Doctor
          </label>
          <DoctorCombobox
            id="open-encounter-doctor"
            doctors={doctorsQuery.doctors}
            value={doctorId}
            isLoading={doctorsQuery.isPending}
            onChange={setDoctorId}
          />
        </div>
        {actionError ? (
          <p
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
          >
            {actionError}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-primary-container hover:bg-primary"
            disabled={openMutation.isPending}
            onClick={() => void handleConfirm()}
          >
            {openMutation.isPending ? 'Opening...' : 'Open Encounter'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
