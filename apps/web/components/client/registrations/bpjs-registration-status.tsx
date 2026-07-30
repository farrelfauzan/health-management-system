'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { BpjsEligibilityResultView } from '@hms/shared-types';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
  useAbility,
} from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { bpjsEligibilityControllerCheckEligibilityV1 } from '#lib/api/generated/bpjs-pcare/bpjs-pcare';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { useBpjsSubmissions } from '#lib/integrations/use-integration-queries';
import { formatStatusLabel } from '#lib/shared/status-label';

type BpjsRegistrationStatusProps = {
  patientId: string;
  patientName: string;
  registrationId: string;
};

function eligibilityStyle(state: BpjsEligibilityResultView['state']): string {
  if (state === 'ACTIVE') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (state === 'INACTIVE' || state === 'NOT_FOUND') {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

export function BpjsRegistrationStatus({
  patientId,
  patientName,
  registrationId,
}: BpjsRegistrationStatusProps) {
  const ability = useAbility();
  const canCheck = ability.can('check', 'BpjsEligibility');
  const canReadSubmission = ability.can('read', 'BpjsSubmission');

  if (!canCheck && !canReadSubmission) {
    return <span className="text-sm text-slate-400">—</span>;
  }

  return (
    <BpjsRegistrationStatusContent
      patientId={patientId}
      patientName={patientName}
      registrationId={registrationId}
      canCheck={canCheck}
      canReadSubmission={canReadSubmission}
    />
  );
}

type BpjsRegistrationStatusContentProps = BpjsRegistrationStatusProps & {
  canCheck: boolean;
  canReadSubmission: boolean;
};

function BpjsRegistrationStatusContent({
  patientId,
  patientName,
  registrationId,
  canCheck,
  canReadSubmission,
}: BpjsRegistrationStatusContentProps) {
  const t = useTranslations('operations.registrations');
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<BpjsEligibilityResultView | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const submissionsQuery = useBpjsSubmissions(
    { page: 1, limit: 10, registrationId },
    canReadSubmission,
  );
  const latestSubmission = submissionsQuery.submissions[0];

  const checkMutation = useMutation({
    mutationFn: async (force: boolean) => {
      const response = await bpjsEligibilityControllerCheckEligibilityV1(patientId, { force });
      return parseApiSuccess<BpjsEligibilityResultView>(response, t('eligibilityError')).data;
    },
    onSuccess: (eligibility) => {
      setResult(eligibility);
      setCheckError(null);
    },
    onError: (error) => setCheckError(notifyApiError(error, t('eligibilityError'))),
  });

  function openEligibility(): void {
    setOpen(true);
    setCheckError(null);
    checkMutation.mutate(false);
  }

  return (
    <div className="flex min-w-32 flex-col items-start gap-2">
      {canReadSubmission ? (
        latestSubmission ? (
          <Badge
            variant="outline"
            className={
              latestSubmission.status === 'SUBMITTED'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : latestSubmission.status === 'FAILED'
                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                  : 'border-amber-200 bg-amber-50 text-amber-700'
            }
          >
            PCare {formatStatusLabel(latestSubmission.status)}
          </Badge>
        ) : (
          <span className="text-xs text-slate-400">
            {submissionsQuery.isPending ? 'Checking bridge…' : 'Not queued'}
          </span>
        )
      ) : null}
      {canCheck ? (
        <Button type="button" size="sm" variant="ghost" onClick={openEligibility}>
          <Icon name="verified_user" size={16} />
          Eligibility
        </Button>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('labels.eligibility')}</DialogTitle>
            <DialogDescription>
              Current PCare membership status for {patientName}. No card number is displayed.
            </DialogDescription>
          </DialogHeader>

          {checkMutation.isPending ? (
            <div className="flex items-center gap-2 rounded-lg border p-5 text-sm text-slate-600">
              <Icon name="progress_activity" size={20} className="animate-spin" />
              Contacting BPJS PCare…
            </div>
          ) : null}
          {checkError ? (
            <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
              {checkError}
            </p>
          ) : null}
          {result ? (
            <Card className={eligibilityStyle(result.state)}>
              <CardContent className="space-y-4 pt-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide">
                      {t('labels.membership')}
                    </p>
                    <p className="mt-1 text-xl font-semibold">{formatStatusLabel(result.state)}</p>
                  </div>
                  <Badge variant="outline" className={eligibilityStyle(result.state)}>
                    {result.isFromCache ? 'Cached today' : 'Live result'}
                  </Badge>
                </div>
                <p className="text-sm">{result.message}</p>
                {result.member ? (
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs opacity-70">{t('labels.registeredName')}</dt>
                      <dd className="font-medium">{result.member.name ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs opacity-70">{t('labels.memberClass')}</dt>
                      <dd className="font-medium">
                        {[result.member.memberClass, result.member.memberType]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs opacity-70">{t('labels.provider')}</dt>
                      <dd className="font-medium">{result.member.providerName ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs opacity-70">{t('labels.facilityMatch')}</dt>
                      <dd className="font-medium">
                        {result.member.isRegisteredHere === null
                          ? t('unknown')
                          : result.member.isRegisteredHere
                            ? 'Registered here'
                            : 'Different FKTP'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs opacity-70">{t('labels.programs')}</dt>
                      <dd className="font-medium">
                        {[
                          result.member.isProlanis ? 'Prolanis' : null,
                          result.member.isPrb ? 'PRB' : null,
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'None reported'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs opacity-70">{t('labels.statusReason')}</dt>
                      <dd className="font-medium">{result.member.statusReason ?? '—'}</dd>
                    </div>
                  </dl>
                ) : null}
                <p className="text-xs opacity-70">
                  {t('checkedAt', {
                    date: format.dateTime(new Date(result.checkedAt), {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }),
                  })}
                  {result.checkedVia ? ` via ${formatStatusLabel(result.checkedVia)}` : ''}
                </p>
              </CardContent>
            </Card>
          ) : null}

          <DialogFooter>
            {result ? (
              <Button
                type="button"
                variant="outline"
                disabled={checkMutation.isPending}
                onClick={() => checkMutation.mutate(true)}
              >
                Refresh from BPJS
              </Button>
            ) : null}
            <Button type="button" onClick={() => setOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
