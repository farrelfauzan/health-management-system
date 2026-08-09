import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  ChannelMetricsQueryInput,
  ChannelMetricsView,
  getCalendarDateInTimeZone,
} from '@hms/shared-types';

import { ChannelMetricsRepository } from '../repository/channel-metrics.repository';

const DEFAULT_CLINIC_TIME_ZONE = 'Asia/Jakarta';
const MS_PER_DAY = 86_400_000;

/**
 * §8.4's channel metrics (`PCS-T11`).
 *
 * These five numbers exist to make the staged-rollout decision read evidence
 * instead of impressions. "Two clean weeks on Telegram" (§9) is the gate
 * before a WhatsApp number is announced, and *clean* has to mean something
 * checkable — otherwise the gate is whoever remembers the last complaint.
 *
 * Every rate is returned alongside the counts it came from, deliberately. A
 * handoff rate of 1.0 is alarming over a hundred conversations and meaningless
 * over one, and a dashboard that showed only the ratio would make the second
 * look like the first.
 */
@Injectable()
export class ChannelMetricsService {
  private readonly clinicTimeZone: string;

  constructor(
    configService: ConfigService,
    private readonly metricsRepository: ChannelMetricsRepository,
  ) {
    this.clinicTimeZone =
      configService.get<string>('CLINIC_TIMEZONE') ?? DEFAULT_CLINIC_TIME_ZONE;
  }

  async readMetrics(query: ChannelMetricsQueryInput): Promise<ChannelMetricsView> {
    const now = new Date();
    const since = new Date(now.getTime() - query.days * MS_PER_DAY);
    const [inboundMessages, conversationsStarted, bookingsConfirmed, blockedConversations, safetyTags, tools] =
      await Promise.all([
        this.metricsRepository.countInboundMessages(since),
        this.metricsRepository.countConversationsStarted(since),
        this.metricsRepository.countChannelBookings(since),
        this.metricsRepository.countBlockedConversations(),
        this.metricsRepository.countSafetyTags(since),
        this.metricsRepository.countToolInvocations(since),
      ]);
    // Handoffs are counted from the safety tag rather than from conversations
    // currently in NEEDS_HUMAN: a state is a snapshot and would report zero
    // for a fortnight in which every handoff was worked and closed, which is
    // exactly the fortnight the gate is asking about.
    const handoffs =
      (safetyTags.handoff_requested ?? 0) + (safetyTags.emergency_escalation ?? 0);
    return {
      from: getCalendarDateInTimeZone(since, this.clinicTimeZone),
      to: getCalendarDateInTimeZone(now, this.clinicTimeZone),
      windowDays: query.days,
      inboundMessages,
      messagesPerDay: this.toRate(inboundMessages, query.days) ?? 0,
      conversationsStarted,
      intentMix: tools.intentMix,
      bookingsConfirmed,
      bookingConversion: this.toRate(bookingsConfirmed, conversationsStarted) ?? 0,
      handoffs,
      handoffRate: this.toRate(handoffs, conversationsStarted) ?? 0,
      faqSearches: tools.faqSearches,
      faqNoHits: tools.faqNoHits,
      // Null rather than zero when nothing was searched. A no-hit rate of 0
      // reads as "the corpus answered everything"; the truth is that nobody
      // asked it anything, and those are opposite conclusions about whether
      // the FAQ corpus is working.
      faqNoHitRate: this.toRate(tools.faqNoHits, tools.faqSearches),
      rateLimitedTurns: safetyTags.rate_limited ?? 0,
      budgetExhaustedTurns: safetyTags.daily_budget_exhausted ?? 0,
      enumerationFlags: safetyTags.enumeration_suspected ?? 0,
      blockedConversations,
    };
  }

  /** Rounded to three places; null on a zero denominator rather than NaN. */
  private toRate(numerator: number, denominator: number): number | null {
    if (denominator <= 0) {
      return null;
    }
    return Math.round((numerator / denominator) * 1000) / 1000;
  }
}
