'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TelegramWebhookHealth } from '@hms/shared-types';
import { Button, Card, CardContent } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import {
  channelGatewayAdminControllerRegisterTelegramWebhookV1,
  getChannelGatewayAdminControllerGetTelegramWebhookHealthV1QueryKey,
} from '#lib/api/generated/channel-gateway/channel-gateway';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { parseApiSuccess } from '#lib/api/response';
import { useTelegramWebhookHealth } from '#lib/channel-gateway/use-telegram-webhook-health';
import { resolveTelegramWebhookStatus } from '#lib/channel-gateway/resolve-telegram-webhook-status';

const STATUS_TEXT_CLASS: Record<string, string> = {
  NOT_CONFIGURED: 'text-slate-600',
  NO_DOMAIN: 'text-red-800',
  UNREGISTERED: 'text-red-800',
  HIJACKED: 'text-red-800',
  DELIVERY_FAILING: 'text-amber-800',
  PAUSED: 'text-slate-600',
  HEALTHY: 'text-emerald-800',
};

/**
 * The Telegram webhook registration card (§8.4).
 *
 * Sits beside the WhatsApp session card because the two answer the same
 * operational question — is this channel actually reaching customers — and
 * both fail without erring. A webhook that points at the wrong deployment is
 * the Telegram equivalent of a logged-out session: every reply the API
 * composes is delivered to somebody else's server, and nothing anywhere says
 * so.
 *
 * **The URL is displayed, never edited.** The button sends no address; the
 * server rebuilds it from its own `HMS_DOMAIN`. A field here would turn this
 * card into a way to point the clinic's bot at any host on the internet, and
 * would reintroduce exactly the typo class that silently breaks the channel.
 */
export function TelegramWebhookCard() {
  const t = useTranslations('channelGateway.telegram');
  const format = useFormatter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const { webhook, isLoading } = useTelegramWebhookHealth();
  const registerMutation = useMutation({
    mutationFn: async () =>
      parseApiSuccess<TelegramWebhookHealth>(
        await channelGatewayAdminControllerRegisterTelegramWebhookV1(),
        t('registerFailed'),
      ),
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({
        queryKey: getChannelGatewayAdminControllerGetTelegramWebhookHealthV1QueryKey(),
      });
    },
    onError: (caughtError: unknown) => {
      setError(resolveApiErrorMessage(caughtError, t('registerFailed')));
    },
  });

  if (isLoading || webhook === undefined) {
    return null;
  }

  const status = resolveTelegramWebhookStatus(webhook);
  const canRegister = webhook.isConfigured && webhook.expectedUrl !== null;

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-slate-500">{t('title')}</p>
            <p className={`text-lg font-semibold ${STATUS_TEXT_CLASS[status]}`}>
              {t(`status.${status}`)}
            </p>
            <p className="text-sm text-slate-500">{t(`hint.${status}`)}</p>
          </div>
          {canRegister ? (
            <Button
              type="button"
              variant={status === 'HEALTHY' ? 'outline' : 'default'}
              disabled={registerMutation.isPending}
              onClick={() => registerMutation.mutate()}
            >
              {registerMutation.isPending ? t('registering') : t('register')}
            </Button>
          ) : null}
        </div>
        {webhook.expectedUrl === null ? null : (
          <div className="space-y-1 rounded-lg bg-slate-50 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">{t('expectedUrl')}</p>
            <p className="break-all font-mono text-xs text-slate-600">{webhook.expectedUrl}</p>
          </div>
        )}
        {status === 'HIJACKED' && webhook.registeredUrl !== null ? (
          <div className="space-y-1 rounded-lg bg-red-50 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-red-700">{t('registeredUrl')}</p>
            <p className="break-all font-mono text-xs text-red-900">{webhook.registeredUrl}</p>
          </div>
        ) : null}
        {webhook.lastErrorMessage === null || webhook.lastErrorAt === null ? null : (
          <p className="text-xs text-slate-400">
            {t(webhook.isLastErrorStale ? 'lastErrorStale' : 'lastErrorLive', {
              message: webhook.lastErrorMessage,
              time: format.dateTime(new Date(webhook.lastErrorAt), { timeStyle: 'medium' }),
            })}
          </p>
        )}
        <p className="text-xs text-slate-400">
          {t('checkedAt', {
            time: format.dateTime(new Date(webhook.checkedAt), { timeStyle: 'medium' }),
          })}
        </p>
        {error ? (
          <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-900">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
