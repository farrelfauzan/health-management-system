'use client';

import type { AppointmentListItem } from '@hms/shared-types';
import { Button } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { AvatarInitials } from '#components/shared/avatar-initials';
import { AppointmentSubjectMrn } from './appointment-subject-mrn';

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
  const t = useTranslations('operations.appointments');
  const format = useFormatter();
  const scheduledAt = new Date(request.scheduledAt);
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
      <div className="flex min-w-0 items-center gap-3">
        <AvatarInitials name={request.subject.fullName} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900">
            {request.subject.fullName}
            <span className="ml-2 font-normal">
              <AppointmentSubjectMrn subject={request.subject} />
            </span>
          </p>
          <p className="truncate text-xs text-slate-500">
            {request.doctor.fullName} ·{' '}
            {t('atTime', {
              date: format.dateTime(scheduledAt, { dateStyle: 'medium' }),
              time: format.dateTime(scheduledAt, { timeStyle: 'short' }),
            })}
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
          {t('reject')}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={isBusy}
          className="bg-primary-container hover:bg-primary"
          onClick={() => onApprove(request)}
        >
          {t('approve')}
        </Button>
      </div>
    </li>
  );
}
