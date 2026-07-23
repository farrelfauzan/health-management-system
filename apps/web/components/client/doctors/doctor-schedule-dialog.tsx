'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  updateDoctorScheduleSchema,
  type DoctorScheduleEntry,
  type DoctorScheduleEntryInput,
  type UpdateDoctorScheduleInput,
} from '@hms/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
} from '@hms/ui';

import { DoctorScheduleEntryRow } from '#components/client/doctors/doctor-schedule-entry-row';
import { doctorManagementControllerUpdateDoctorScheduleV1 } from '#lib/api/generated/doctor-management/doctor-management';
import { parseApiSuccess } from '#lib/api/response';
import { notifyApiError } from '#lib/api/notify-api-error';
import { invalidateDoctorQueries } from '#lib/doctors/invalidate-doctor-queries';

const SAVE_ERROR_FALLBACK = 'Unable to save the schedule. Please try again.';
const DEFAULT_ENTRY: DoctorScheduleEntryInput = {
  dayOfWeek: 1,
  startTime: '08:00',
  endTime: '16:00',
  isAvailable: true,
};

type DoctorScheduleDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doctorId: string;
  doctorName: string;
  initialSchedules: DoctorScheduleEntry[];
};

export function DoctorScheduleDialog({
  open,
  onOpenChange,
  doctorId,
  doctorName,
  initialSchedules,
}: DoctorScheduleDialogProps) {
  const queryClient = useQueryClient();
  const [entries, setEntries] = useState<DoctorScheduleEntryInput[]>(
    initialSchedules.map((schedule) => ({
      dayOfWeek: schedule.dayOfWeek,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      isAvailable: schedule.isAvailable,
    })),
  );
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const scheduleMutation = useMutation({
    mutationFn: (input: UpdateDoctorScheduleInput) =>
      doctorManagementControllerUpdateDoctorScheduleV1(doctorId, input),
  });

  function handleEntryChange(index: number, entry: DoctorScheduleEntryInput): void {
    setEntries((current) => current.map((existing, i) => (i === index ? entry : existing)));
  }

  function handleEntryRemove(index: number): void {
    setEntries((current) => current.filter((_, i) => i !== index));
  }

  function handleEntryAdd(): void {
    setEntries((current) => [...current, { ...DEFAULT_ENTRY }]);
  }

  async function handleSave(): Promise<void> {
    setScheduleError(null);
    const parsed = updateDoctorScheduleSchema.safeParse({ schedules: entries });
    if (!parsed.success) {
      setScheduleError(parsed.error.issues[0]?.message ?? 'Invalid schedule entries');
      return;
    }
    try {
      const response = await scheduleMutation.mutateAsync(parsed.data);
      parseApiSuccess<DoctorScheduleEntry[]>(response, SAVE_ERROR_FALLBACK);
      await invalidateDoctorQueries(queryClient);
      onOpenChange(false);
    } catch (error) {
      setScheduleError(notifyApiError(error, SAVE_ERROR_FALLBACK));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-heading">Manage Schedule</DialogTitle>
          <DialogDescription>
            Weekly availability for {doctorName}. Entries must not overlap on the same day.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {scheduleError ? (
            <p
              role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
            >
              {scheduleError}
            </p>
          ) : null}
          {entries.length === 0 ? (
            <p className="text-sm text-slate-500">
              No schedule entries. The doctor has no weekly availability.
            </p>
          ) : (
            entries.map((entry, index) => (
              <DoctorScheduleEntryRow
                key={index}
                entry={entry}
                index={index}
                onChange={handleEntryChange}
                onRemove={handleEntryRemove}
              />
            ))
          )}
          <Button type="button" variant="outline" size="sm" onClick={handleEntryAdd}>
            <Icon name="add" size={16} />
            Add Entry
          </Button>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={scheduleMutation.isPending}
            className="bg-primary-container hover:bg-primary"
            onClick={() => void handleSave()}
          >
            {scheduleMutation.isPending ? 'Saving…' : 'Save Schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
