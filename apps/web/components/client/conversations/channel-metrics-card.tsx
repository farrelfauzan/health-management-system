'use client';

import { Card, CardContent } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ChannelMetricTile } from '#components/client/conversations/channel-metric-tile';
import { useChannelMetrics } from '#lib/conversations/use-channel-metrics';

/** The window the go/no-go checklist asks about (§9's "two clean weeks"). */
const ROLLOUT_WINDOW_DAYS = 14;

/**
 * §8.4's channel metrics (`PCS-T11`).
 *
 * These six numbers exist so the staged-rollout decision reads evidence rather
 * than impressions. The gate before a WhatsApp number is announced is "two
 * clean weeks on Telegram", and *clean* has to be checkable — otherwise it
 * means whoever remembers the last complaint.
 *
 * Every rate is rendered **next to the counts it came from**, which is the
 * card's one real design rule: a handoff rate of 1.0 is alarming over a
 * hundred conversations and meaningless over one, and a tile showing only the
 * ratio would make the second look like the first.
 */
export function ChannelMetricsCard() {
  const t = useTranslations('conversations.metrics');
  const { metrics, isLoading, isError } = useChannelMetrics(ROLLOUT_WINDOW_DAYS);

  if (isLoading || isError || metrics === undefined) {
    return null;
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-heading text-base font-semibold text-slate-900">{t('title')}</h2>
          <p className="text-xs text-slate-500">
            {t('window', { from: metrics.from, to: metrics.to })}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <ChannelMetricTile
            label={t('messagesPerDay')}
            value={metrics.messagesPerDay.toFixed(1)}
            detail={t('ofMessages', { count: metrics.inboundMessages })}
          />
          <ChannelMetricTile
            label={t('conversations')}
            value={String(metrics.conversationsStarted)}
            detail={t('inWindow')}
          />
          <ChannelMetricTile
            label={t('bookingConversion')}
            value={formatRate(metrics.bookingConversion)}
            detail={t('ofBookings', { count: metrics.bookingsConfirmed })}
            tone={metrics.bookingConversion >= 0.1 ? 'good' : 'warn'}
          />
          <ChannelMetricTile
            label={t('handoffRate')}
            value={formatRate(metrics.handoffRate)}
            detail={t('ofHandoffs', { count: metrics.handoffs })}
            tone={metrics.handoffRate < 0.25 ? 'good' : 'warn'}
          />
          <ChannelMetricTile
            label={t('faqNoHitRate')}
            // Null is rendered as an em dash rather than 0%: a zero would read
            // as "the corpus answered everything" when the truth is nobody
            // asked it anything, and those are opposite conclusions.
            value={metrics.faqNoHitRate === null ? '—' : formatRate(metrics.faqNoHitRate)}
            detail={t('ofSearches', { count: metrics.faqSearches })}
            tone={
              metrics.faqNoHitRate === null || metrics.faqNoHitRate < 0.3 ? 'neutral' : 'warn'
            }
          />
          <ChannelMetricTile
            label={t('abuseSignals')}
            value={String(
              metrics.enumerationFlags + metrics.budgetExhaustedTurns + metrics.blockedConversations,
            )}
            detail={t('abuseBreakdown', {
              enumeration: metrics.enumerationFlags,
              budget: metrics.budgetExhaustedTurns,
              blocked: metrics.blockedConversations,
            })}
            tone={
              metrics.enumerationFlags + metrics.budgetExhaustedTurns === 0 ? 'good' : 'warn'
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}

function formatRate(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}
