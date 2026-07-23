'use client';

import type { AppointmentListItem } from '@hms/shared-types';
import { Button } from '@hms/ui';

import { AvatarInitials } from '#components/shared/avatar-initials';
import {
  formatAppointmentDate,
  formatAppointmentTime,
} from '#lib/appointments/format-appointment-time';

type AppointmentRequestRowProps = {
  request: AppointmentListItem;
  isBusy: boolean;
  onApprove: (request: AppointmentListItem) => void;
  onReject: (request: AppointmentListItem) => void;
};

export function AppointmentRequestRow({
  request,
  isBusy,
  onApprove,
  onReject,
}: AppointmentRequestRowProps) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
      <div className="flex min-w-0 items-center gap-3">
        <AvatarInitials name={request.patient.fullName} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900">
            {request.patient.fullName}
            <span className="ml-2 font-mono text-xs font-normal text-slate-500">
              {request.patient.mrn}
            </span>
          </p>
          <p className="truncate text-xs text-slate-500">
            {request.doctor.fullName} · {formatAppointmentDate(request.scheduledAt)} at{' '}
            {formatAppointmentTime(request.scheduledAt)}
            {request.reason ? ` · ${request.reason}` : ''}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isBusy}
          onClick={() => onReject(request)}
        >
          Reject
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={isBusy}
          className="bg-primary-container hover:bg-primary"
          onClick={() => onApprove(request)}
        >
          Approve
        </Button>
      </div>
    </li>
  );
}
