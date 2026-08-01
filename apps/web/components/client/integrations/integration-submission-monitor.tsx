'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  BpjsSubmissionStatusValue,
  BpjsSubmissionTypeValue,
  SatusehatSubmissionStatusValue,
} from '@hms/shared-types';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Icon,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
  toast,
  useAbility,
} from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import {
  bpjsSubmissionControllerRetrySubmissionV1,
  getBpjsSubmissionControllerListSubmissionsV1QueryKey,
} from '#lib/api/generated/bpjs-pcare/bpjs-pcare';
import {
  getSatusehatSubmissionControllerListSubmissionsV1QueryKey,
  satusehatSubmissionControllerRetrySubmissionV1,
} from '#lib/api/generated/satusehat/satusehat';
import { notifyApiError } from '#lib/api/notify-api-error';
import {
  useBpjsMonthlyReport,
  useBpjsSubmissions,
  useSatusehatSubmissions,
} from '#lib/integrations/use-integration-queries';
import { formatStatusLabel } from '#lib/shared/status-label';
import { IntegrationProviderLogo } from '#components/client/integrations/integration-provider-logo';

type Provider = 'bpjs' | 'satusehat';
type StatusFilter = 'ALL' | BpjsSubmissionStatusValue;

type MonitorRow = {
  id: string;
  localReference: string;
  kind: string;
  status: BpjsSubmissionStatusValue | SatusehatSubmissionStatusValue;
  attempts: number;
  externalReference: string | null;
  lastError: string | null;
  lastAttemptAt: string | null;
};

const STATUS_OPTIONS: StatusFilter[] = ['ALL', 'PENDING', 'SUBMITTED', 'FAILED'];
// Both BPJS integrations drain through one outbox, so this filter spans them:
// the first four are PCare claims (P11-T05), the ANTREAN_* three are Antrean
// Online queue publishing (P14-T05). Listed rather than derived from the enum
// so the order stays meaningful to an operator — claims first, queue second.
const TYPE_OPTIONS: Array<'ALL' | BpjsSubmissionTypeValue> = [
  'ALL',
  'PENDAFTARAN',
  'KUNJUNGAN',
  'PENDAFTARAN_DELETE',
  'OBAT',
  'ANTREAN_ADD',
  'ANTREAN_PANGGIL',
  'ANTREAN_BATAL',
];

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function statusClass(status: MonitorRow['status']): string {
  if (status === 'SUBMITTED') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (status === 'FAILED') {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

export function IntegrationSubmissionMonitor() {
  const t = useTranslations('operations.integrations');
  const format = useFormatter();
  const formatDate = (value: string | null) =>
    value ? format.dateTime(new Date(value), { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  const ability = useAbility();
  const queryClient = useQueryClient();
  const canReadBpjs = ability.can('read', 'BpjsSubmission');
  const canReadSatusehat = ability.can('read', 'SatusehatSubmission');
  const [provider, setProvider] = useState<Provider>(canReadBpjs ? 'bpjs' : 'satusehat');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [type, setType] = useState<'ALL' | BpjsSubmissionTypeValue>('ALL');
  const [month, setMonth] = useState(currentMonth);

  const bpjsQuery = useBpjsSubmissions(
    {
      page: 1,
      limit: 50,
      status: status === 'ALL' ? undefined : status,
      type: type === 'ALL' ? undefined : type,
    },
    canReadBpjs && provider === 'bpjs',
  );
  const satusehatQuery = useSatusehatSubmissions(
    {
      page: 1,
      limit: 50,
      status: status === 'ALL' ? undefined : status,
    },
    canReadSatusehat && provider === 'satusehat',
  );
  const reportQuery = useBpjsMonthlyReport(month, canReadBpjs && provider === 'bpjs');

  const rows = useMemo<MonitorRow[]>(() => {
    if (provider === 'bpjs') {
      return bpjsQuery.submissions.map((submission) => ({
        id: submission.id,
        localReference: submission.registrationId,
        kind: formatStatusLabel(submission.type),
        status: submission.status,
        attempts: submission.attempts,
        externalReference: submission.bpjsReferenceNo,
        lastError: submission.lastError,
        lastAttemptAt: submission.lastAttemptAt,
      }));
    }
    return satusehatQuery.submissions.map((submission) => ({
      id: submission.id,
      localReference: submission.encounterId,
      kind: 'ENCOUNTER',
      status: submission.status,
      attempts: submission.attempts,
      externalReference: submission.satusehatEncounterId,
      lastError: submission.lastError,
      lastAttemptAt: submission.lastAttemptAt,
    }));
  }, [bpjsQuery.submissions, provider, satusehatQuery.submissions]);

  const retryMutation = useMutation({
    mutationFn: async (row: MonitorRow) => {
      if (provider === 'bpjs') {
        await bpjsSubmissionControllerRetrySubmissionV1(row.id);
        return;
      }
      await satusehatSubmissionControllerRetrySubmissionV1(row.id);
    },
    onSuccess: async () => {
      const queryKey =
        provider === 'bpjs'
          ? getBpjsSubmissionControllerListSubmissionsV1QueryKey()
          : getSatusehatSubmissionControllerListSubmissionsV1QueryKey();
      await queryClient.invalidateQueries({ queryKey: [queryKey[0]] });
      toast.success('Submission queued for retry.');
    },
    onError: (error) => notifyApiError(error, t('retryError')),
  });

  const activeQuery = provider === 'bpjs' ? bpjsQuery : satusehatQuery;
  const canRetry =
    provider === 'bpjs'
      ? ability.can('retry', 'BpjsSubmission')
      : ability.can('retry', 'SatusehatSubmission');

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="gap-4">
          <div>
            <CardTitle>{t('labels.monitor')}</CardTitle>
            <CardDescription>
              Inspect delivery state and retry terminal failures without exposing clinical payloads.
            </CardDescription>
          </div>
          <Tabs
            value={provider}
            onValueChange={(value) => {
              setProvider(value as Provider);
              setStatus('ALL');
            }}
          >
            <TabsList className="gap-2">
              {canReadBpjs ? (
                <TabsTrigger value="bpjs" className="h-10 px-4">
                  <IntegrationProviderLogo provider="bpjs" />
                </TabsTrigger>
              ) : null}
              {canReadSatusehat ? (
                <TabsTrigger value="satusehat" className="h-10 px-4">
                  <IntegrationProviderLogo provider="satusehat" />
                </TabsTrigger>
              ) : null}
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Select value={status} onValueChange={(value) => setStatus(value as StatusFilter)}>
              <SelectTrigger className="w-44" aria-label={t('submissionStatus')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option === 'ALL' ? t('allStatuses') : formatStatusLabel(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {provider === 'bpjs' ? (
              <Select
                value={type}
                onValueChange={(value) => setType(value as 'ALL' | BpjsSubmissionTypeValue)}
              >
                <SelectTrigger className="w-52" aria-label={t('submissionType')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option === 'ALL' ? t('allTypes') : formatStatusLabel(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Button
              type="button"
              variant="outline"
              disabled={activeQuery.isFetching}
              onClick={() => void activeQuery.refetch()}
            >
              <Icon name="refresh" size={17} />
              Refresh
            </Button>
          </div>

          {activeQuery.isError ? (
            <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
              {t('noSubmissions')}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('labels.localReference')}</TableHead>
                    <TableHead>{t('labels.type')}</TableHead>
                    <TableHead>{t('submissionStatus')}</TableHead>
                    <TableHead>{t('labels.attempts')}</TableHead>
                    <TableHead>{t('labels.lastAttempt')}</TableHead>
                    <TableHead>{t('labels.externalReference')}</TableHead>
                    <TableHead className="text-right">{t('labels.action')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center text-slate-500">
                        {activeQuery.isPending ? t('loadingSubmissions') : t('noSubmissions')}
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-mono text-xs">{row.localReference}</TableCell>
                        <TableCell>{row.kind}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusClass(row.status)}>
                            {formatStatusLabel(row.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>{row.attempts}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatDate(row.lastAttemptAt)}
                        </TableCell>
                        <TableCell className="max-w-72">
                          <span
                            className={row.lastError ? 'text-rose-700' : 'font-mono text-xs'}
                            title={row.lastError ?? row.externalReference ?? undefined}
                          >
                            {row.lastError ?? row.externalReference ?? '—'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {row.status === 'FAILED' && canRetry ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={retryMutation.isPending}
                              onClick={() => retryMutation.mutate(row)}
                            >
                              Retry
                            </Button>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {provider === 'bpjs' && canReadBpjs ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('labels.monthly')}</CardTitle>
            <CardDescription>
              Recorded, submitted, pending, and failed rows by type.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              className="w-48"
              type="month"
              aria-label={t('reconciliationMonth')}
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(reportQuery.data?.types ?? []).map((summary) => (
                <div key={summary.type} className="rounded-lg border p-4">
                  <p className="text-xs font-semibold tracking-wide text-slate-500">
                    {formatStatusLabel(summary.type)}
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">
                    {summary.submitted}/{summary.recorded}
                  </p>
                  <p className="text-xs text-slate-500">
                    {summary.pending} pending · {summary.failed} failed
                  </p>
                </div>
              ))}
              {!reportQuery.isPending && (reportQuery.data?.types.length ?? 0) === 0 ? (
                <p className="text-sm text-slate-500">{t('labels.noActivity')}</p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
