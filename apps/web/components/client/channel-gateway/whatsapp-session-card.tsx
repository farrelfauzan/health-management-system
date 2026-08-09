'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button, Card, CardContent } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { channelGatewayAdminControllerStartPairingV1 } from '#lib/api/generated/channel-gateway/channel-gateway';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { parseApiSuccess } from '#lib/api/response';
import { useWhatsappSessionHealth } from '#lib/channel-gateway/use-whatsapp-session-health';

type PairingSession = { qrLink: string; expiresInSeconds: number | null };

/**
 * The WhatsApp session-health card (`PCS-T09`, §8.4).
 *
 * §8.4 calls a silently logged-out WhatsApp session the channel's number one
 * operational failure mode, and *silent* is the whole problem: nothing errors.
 * The bridge keeps answering, the API keeps taking bookings, and every reply is
 * never delivered. A clinic can lose a day of messages without one line in a
 * log. This card is the only place that state is visible.
 *
 * The three flags are shown as three separate facts rather than one
 * traffic-light, because they want three different responses: nobody
 * configured it, the bridge cannot reach WhatsApp (usually transient), or the
 * pairing is gone — and only the last one needs a person holding the clinic's
 * phone.
 */
export function WhatsappSessionCard() {
  const t = useTranslations('channelGateway.whatsapp');
  const format = useFormatter();
  const [pairing, setPairing] = useState<PairingSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { session, isLoading } = useWhatsappSessionHealth();
  const pairingMutation = useMutation({
    mutationFn: async () =>
      parseApiSuccess<PairingSession>(
        await channelGatewayAdminControllerStartPairingV1(),
        t('pairFailed'),
      ),
    onSuccess: (envelope) => {
      setError(null);
      setPairing(envelope.data);
    },
    onError: (caughtError: unknown) => {
      setPairing(null);
      setError(resolveApiErrorMessage(caughtError, t('pairFailed')));
    },
  });

  if (isLoading || session === undefined) {
    return null;
  }

  const status = resolveStatus(session);

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              {t('title', { kind: session.kind })}
            </p>
            <p className={`text-lg font-semibold ${STATUS_TEXT_CLASS[status]}`}>
              {t(`status.${status}`)}
            </p>
            <p className="text-sm text-slate-500">{t(`hint.${status}`)}</p>
          </div>
          {/* Offered only when re-pairing is the actual fix. A pairing button
              next to a healthy session is an invitation to log the clinic out
              of WhatsApp by curiosity. */}
          {status === 'LOGGED_OUT' ? (
            <Button
              type="button"
              disabled={pairingMutation.isPending}
              onClick={() => pairingMutation.mutate()}
            >
              {pairingMutation.isPending ? t('pairing') : t('pair')}
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-slate-400">
          {t('checkedAt', {
            time: format.dateTime(new Date(session.checkedAt), { timeStyle: 'medium' }),
          })}
        </p>
        {error ? (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p>
        ) : null}
        {pairing ? (
          <div className="space-y-2 rounded-lg bg-slate-50 px-4 py-3">
            <p className="text-sm text-slate-700">{t('pairInstructions')}</p>
            {/* The QR link points at the bridge on the private network and is
                deliberately not proxied or embedded: a pairing code grants the
                WhatsApp session outright, so it must not travel through HMS or
                into a browser cache here. */}
            <p className="break-all font-mono text-xs text-slate-600">{pairing.qrLink}</p>
            {pairing.expiresInSeconds === null ? null : (
              <p className="text-xs text-slate-500">
                {t('pairExpiry', { seconds: pairing.expiresInSeconds })}
              </p>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

type SessionStatus = 'NOT_CONFIGURED' | 'LOGGED_OUT' | 'DISCONNECTED' | 'HEALTHY';

const STATUS_TEXT_CLASS: Record<SessionStatus, string> = {
  NOT_CONFIGURED: 'text-slate-600',
  LOGGED_OUT: 'text-red-800',
  DISCONNECTED: 'text-amber-800',
  HEALTHY: 'text-emerald-800',
};

/**
 * Ordered worst-first, and the order is the point: a session that is both
 * disconnected and logged out needs a QR scan, so the logout has to win. The
 * opposite order would tell an operator to wait for a reconnection that can
 * never happen.
 */
function resolveStatus(session: {
  isConfigured: boolean;
  isConnected: boolean;
  isLoggedIn: boolean;
}): SessionStatus {
  if (!session.isConfigured) {
    return 'NOT_CONFIGURED';
  }
  if (!session.isLoggedIn) {
    return 'LOGGED_OUT';
  }
  if (!session.isConnected) {
    return 'DISCONNECTED';
  }
  return 'HEALTHY';
}
