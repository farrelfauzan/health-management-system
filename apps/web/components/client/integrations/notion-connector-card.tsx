'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { NotionConnectionTestResult } from '@hms/shared-types';
import { Button, Card, CardContent } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { InlineNotice } from '#components/client/shared/inline-notice';
import { notionConnectorControllerTestConnectionV1 } from '#lib/api/generated/notion-connector/notion-connector';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { parseApiSuccess } from '#lib/api/response';
import { useNotionConnectorStatus } from '#lib/integrations/use-notion-connector-status';

/**
 * The Notion bug-report connector card (P23-T05).
 *
 * Read-only by design, and the design is the decision: the configuration is
 * environment-only (P23-T02) because the Bug Board belongs to Saling Jaga and
 * not to the clinic, so there is no form here and an unconfigured deployment
 * gets a hint about the server's `NOTION_*` variables rather than fields to
 * fill in.
 *
 * What it does offer is the one thing an operator cannot get any other way
 * without shelling into the server: whether the board still has the columns
 * the publisher writes. A renamed column stops every bug report with no
 * warning attached, and this is where it becomes visible.
 */
export function NotionConnectorCard() {
  const t = useTranslations('operations.integrations.notion');
  const format = useFormatter();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<NotionConnectionTestResult | null>(null);
  const { status, isLoading } = useNotionConnectorStatus();
  const testMutation = useMutation({
    mutationFn: async () =>
      parseApiSuccess<NotionConnectionTestResult>(
        await notionConnectorControllerTestConnectionV1(),
        t('testFailed'),
      ),
    onSuccess: (envelope) => {
      setError(null);
      setResult(envelope.data);
    },
    onError: (caughtError: unknown) => {
      setResult(null);
      setError(resolveApiErrorMessage(caughtError, t('testFailed')));
    },
  });

  if (isLoading || status === undefined) {
    return null;
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-slate-500">{t('title')}</p>
            <p
              className={`text-lg font-semibold ${
                status.isConfigured ? 'text-emerald-800' : 'text-slate-600'
              }`}
            >
              {t(status.isConfigured ? 'configured' : 'notConfigured')}
            </p>
            <p className="text-sm text-slate-500">
              {t(status.isConfigured ? 'configuredHint' : 'notConfiguredHint')}
            </p>
          </div>
          {status.isConfigured ? (
            <Button
              type="button"
              variant="outline"
              disabled={testMutation.isPending}
              onClick={() => testMutation.mutate()}
            >
              {testMutation.isPending ? t('testing') : t('testConnection')}
            </Button>
          ) : null}
        </div>
        <dl className="grid gap-3 rounded-lg bg-slate-50 px-4 py-3 sm:grid-cols-4">
          <div className="space-y-1">
            <dt className="text-xs uppercase tracking-wide text-slate-500">{t('apiVersion')}</dt>
            <dd className="font-mono text-xs text-slate-600">{status.apiVersion}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs uppercase tracking-wide text-slate-500">{t('boardHint')}</dt>
            <dd className="font-mono text-xs text-slate-600">
              {status.dataSourceIdLast4 === null ? '—' : `…${status.dataSourceIdLast4}`}
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs uppercase tracking-wide text-slate-500">{t('breaker')}</dt>
            <dd className="font-mono text-xs text-slate-600">
              {t(`breakerState.${status.circuitBreakerState}`)}
            </dd>
          </div>
          {/*
            The only cell that says the pipeline *works* rather than that it is
            configured (P23-T10). Publishing is silent by design — the reporter is
            answered at intake and never sees the board — so a green connector
            whose last publish was three weeks ago is exactly the failure this
            card exists to surface, and nothing else on it can tell that apart
            from a quiet month.
          */}
          <div className="space-y-1">
            <dt className="text-xs uppercase tracking-wide text-slate-500">
              {t('lastPublished')}
            </dt>
            <dd className="font-mono text-xs text-slate-600">
              {status.lastPublishedAt === null
                ? t('neverPublished')
                : format.dateTime(new Date(status.lastPublishedAt), { dateStyle: 'medium' })}
            </dd>
          </div>
        </dl>
        {error === null ? null : <InlineNotice tone="error">{error}</InlineNotice>}
        {result === null ? null : (
          <div className="space-y-2">
            <InlineNotice tone={result.isSuccessful ? 'success' : 'error'}>
              {t(result.isSuccessful ? 'testPassed' : 'testFailedWithProblems', {
                count: result.problems.length,
              })}
            </InlineNotice>
            {result.problems.length === 0 ? null : (
              <ul className="space-y-1 rounded-lg bg-red-50 px-4 py-3">
                {result.problems.map((problem) => (
                  <li key={problem.field} className="font-mono text-xs text-red-900">
                    {t('problem', {
                      field: problem.field,
                      expected: problem.expected,
                      actual: problem.actual,
                    })}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-slate-400">
              {t('checkedAt', {
                time: format.dateTime(new Date(result.checkedAt), { timeStyle: 'medium' }),
              })}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
