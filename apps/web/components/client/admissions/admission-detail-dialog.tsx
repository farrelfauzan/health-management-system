'use client';

import type { AdmissionResponse } from '@hms/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { AdmissionBedHistoryList } from '#components/client/admissions/admission-bed-history-list';
import { StatusBadge } from '#components/shared/status-badge';

type AdmissionDetailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  admission: AdmissionResponse;
};

export function AdmissionDetailDialog({
  open,
  onOpenChange,
  admission,
}: AdmissionDetailDialogProps) {
  const t = useTranslations('operations');
  const format = useFormatter();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('admissions.detail')}</DialogTitle>
          <DialogDescription>
            {admission.patient.fullName} — {admission.patient.mrn}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-slate-500">{t('admissions.status')}</dt>
              <dd className="mt-1">
                <StatusBadge status={admission.status} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">{t('admissions.doctor')}</dt>
              <dd className="mt-1 text-sm text-slate-800">{admission.admittingDoctor.fullName}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">{t('admissions.admittedAt')}</dt>
              <dd className="mt-1 text-sm text-slate-800">
                {format.dateTime(new Date(admission.admittedAt), {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">{t('admissions.dischargedAt')}</dt>
              <dd className="mt-1 text-sm text-slate-800">
                {admission.dischargedAt
                  ? format.dateTime(new Date(admission.dischargedAt), {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })
                  : '—'}
              </dd>
            </div>
          </dl>

          {admission.reason ? (
            <div>
              <p className="text-xs text-slate-500">{t('admissions.reason')}</p>
              <p className="mt-1 whitespace-pre-line text-sm text-slate-800">{admission.reason}</p>
            </div>
          ) : null}

          {admission.dischargeSummary ? (
            <div>
              <p className="text-xs text-slate-500">{t('admissions.dischargeSummary')}</p>
              <p className="mt-1 whitespace-pre-line text-sm text-slate-800">
                {admission.dischargeSummary}
              </p>
            </div>
          ) : null}

          {admission.cancelReason ? (
            <div>
              <p className="text-xs text-slate-500">{t('admissions.cancelReason')}</p>
              <p className="mt-1 whitespace-pre-line text-sm text-slate-800">
                {admission.cancelReason}
              </p>
            </div>
          ) : null}

          <div>
            <p className="mb-2 text-xs text-slate-500">{t('admissions.bedHistory')}</p>
            <AdmissionBedHistoryList assignments={admission.bedAssignments} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
