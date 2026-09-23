'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getCalendarWeekBounds,
  type AppointmentSessionRescheduleResult,
  type DoctorSessionCalendarItem,
} from '@hms/shared-types';
import {
  Button,
  DatePicker,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Textarea,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { MoveSessionResult } from '#components/client/appointments/move-session-result';
import { FormLabel } from '#components/client/shared/form-label';
import { InlineNotice } from '#components/client/shared/inline-notice';
import { LocalizedTimePicker } from '#components/client/shared/localized-time-picker';
import { appointmentSessionChangeControllerRescheduleSessionV1 } from '#lib/api/generated/appointment-management/appointment-management';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateAppointmentQueries } from '#lib/appointments/invalidate-appointment-queries';
import { resolveMaterializedSessionId } from '#lib/appointments/resolve-materialized-session-id';
import { formatDateParam } from '#lib/appointments/week-range';

const REASON_MIN_LENGTH = 3;

type MoveSessionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: DoctorSessionCalendarItem;
};

type MoveSessionForm = {
  sessionDate: string;
  startTime: string;
  endTime: string;
  capacity: string;
  reason: string;
};

/**
 * Moves one practice-session occurrence to another window in its own
 * Monday–Sunday week (P28-T05). The date picker cannot leave that week, and
 * the result lists the patients who stayed behind for the front desk.
 */
export function MoveSessionDialog({ open, onOpenChange, session }: MoveSessionDialogProps) {
  const t = useTranslations('operations.appointments.sessionChange');
  const queryClient = useQueryClient();
  const week = getCalendarWeekBounds(session.sessionDate);
  const today = formatDateParam(new Date());
  const [form, setForm] = useState<MoveSessionForm>({
    sessionDate: session.sessionDate,
    startTime: session.startTime,
    endTime: session.endTime,
    capacity: session.maxPatients === null ? '' : String(session.maxPatients),
    reason: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<AppointmentSessionRescheduleResult | null>(null);
  const moveMutation = useMutation({
    mutationFn: async (maxPatients: number | null) => {
      const sessionId = await resolveMaterializedSessionId(session, t('moveError'));
      return appointmentSessionChangeControllerRescheduleSessionV1(sessionId, {
        sessionDate: form.sessionDate,
        startTime: form.startTime,
        endTime: form.endTime,
        maxPatients,
        reason: form.reason.trim(),
      });
    },
  });

  function updateForm(patch: Partial<MoveSessionForm>): void {
    setForm((current) => ({ ...current, ...patch }));
  }

  function validateForm(): string | null {
    if (form.reason.trim().length < REASON_MIN_LENGTH) {
      return t('reasonRequired');
    }
    if (!form.startTime || !form.endTime || form.startTime >= form.endTime) {
      return t('timeOrder');
    }
    const capacity = form.capacity.trim();
    if (capacity !== '' && !(Number.isInteger(Number(capacity)) && Number(capacity) >= 1)) {
      return t('capacityInvalid');
    }
    return null;
  }

  async function handleSubmit(): Promise<void> {
    const validationError = validateForm();
    setFormError(validationError);
    if (validationError) {
      return;
    }
    const capacity = form.capacity.trim();
    try {
      const response = await moveMutation.mutateAsync(capacity === '' ? null : Number(capacity));
      setResult(parseApiSuccess<AppointmentSessionRescheduleResult>(response, t('moveError')).data);
      await invalidateAppointmentQueries(queryClient);
    } catch (error) {
      setFormError(notifyApiError(error, t('moveError')));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {result ? t('resultTitle') : t('moveTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('sessionSummary', {
              doctorName: session.doctor.fullName,
              sessionDate: session.sessionDate,
              startTime: session.startTime,
              endTime: session.endTime,
            })}
          </DialogDescription>
        </DialogHeader>
        {result ? (
          <MoveSessionResult result={result} />
        ) : (
          <div className="space-y-4">
            {formError ? <InlineNotice tone="error">{formError}</InlineNotice> : null}
            <div className="space-y-1.5">
              <FormLabel
                htmlFor="move-session-date"
                className="font-heading text-xs text-slate-600"
                required
              >
                {t('date')}
              </FormLabel>
              <DatePicker
                id="move-session-date"
                value={form.sessionDate}
                minValue={today > week.monday ? today : week.monday}
                maxValue={week.sunday}
                onValueChange={(sessionDate) => updateForm({ sessionDate })}
              />
              <p className="text-xs text-slate-500">
                {t('weekHint', { monday: week.monday, sunday: week.sunday })}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <FormLabel
                  htmlFor="move-session-start"
                  className="font-heading text-xs text-slate-600"
                  required
                >
                  {t('start')}
                </FormLabel>
                <LocalizedTimePicker
                  id="move-session-start"
                  value={form.startTime}
                  onValueChange={(startTime) => updateForm({ startTime })}
                />
              </div>
              <div className="space-y-1.5">
                <FormLabel
                  htmlFor="move-session-end"
                  className="font-heading text-xs text-slate-600"
                  required
                >
                  {t('end')}
                </FormLabel>
                <LocalizedTimePicker
                  id="move-session-end"
                  value={form.endTime}
                  onValueChange={(endTime) => updateForm({ endTime })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <FormLabel
                htmlFor="move-session-capacity"
                className="font-heading text-xs text-slate-600"
              >
                {t('capacity')}
              </FormLabel>
              <Input
                id="move-session-capacity"
                type="number"
                min={1}
                inputMode="numeric"
                value={form.capacity}
                placeholder={t('capacityHint')}
                onChange={(event) => updateForm({ capacity: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <FormLabel
                htmlFor="move-session-reason"
                className="font-heading text-xs text-slate-600"
                required
              >
                {t('reason')}
              </FormLabel>
              <Textarea
                id="move-session-reason"
                rows={2}
                value={form.reason}
                placeholder={t('reasonPlaceholder')}
                onChange={(event) => updateForm({ reason: event.target.value })}
              />
            </div>
            <p className="text-sm text-slate-700">
              {t('patientsNotified', { count: session.bookedCount })}
            </p>
            <p className="text-xs text-slate-500">{t('otherDayNote')}</p>
          </div>
        )}
        <DialogFooter>
          {result ? (
            <Button type="button" onClick={() => onOpenChange(false)}>
              {t('done')}
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t('keep')}
              </Button>
              <Button
                type="button"
                disabled={moveMutation.isPending}
                onClick={() => void handleSubmit()}
              >
                {moveMutation.isPending ? t('moving') : t('submitMove')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
