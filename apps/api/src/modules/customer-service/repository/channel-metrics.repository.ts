import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * The raw counts behind §8.4's channel metrics (`PCS-T11`).
 *
 * Every number is derived from rows the channel already writes — transcript
 * turns, safety tags, conversations, and appointments carrying a
 * `bookingSource`. Nothing here is a counter this code increments.
 *
 * That is a deliberate trade. A counter would be cheaper to read and would
 * survive as a single row, but it would be a second source of truth that
 * drifts the moment a write path forgets it, resets on a deploy, and cannot
 * answer a question nobody thought to count. Deriving means the dashboard can
 * never disagree with the transcript an admin opens to check it — which, on a
 * screen whose whole job is deciding whether to expose a WhatsApp number, is
 * worth more than the query time.
 */
@Injectable()
export class ChannelMetricsRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async countInboundMessages(since: Date): Promise<number> {
    return this.prismaService.conversationMessage.count({
      where: { role: 'CUSTOMER', createdAt: { gte: since } },
    });
  }

  async countConversationsStarted(since: Date): Promise<number> {
    return this.prismaService.conversation.count({ where: { createdAt: { gte: since } } });
  }

  /**
   * Bookings the channel actually produced.
   *
   * Counted on `bookingSource`, not on the patient's `source`: a *verified*
   * customer's chat booking attaches to a long-standing front-desk record, and
   * keying off the person would under-report the channel's conversion by
   * exactly the bookings it did best on.
   */
  async countChannelBookings(since: Date): Promise<number> {
    return this.prismaService.appointment.count({
      where: { deletedAt: null, bookingSource: { not: null }, createdAt: { gte: since } },
    });
  }

  async countBlockedConversations(): Promise<number> {
    return this.prismaService.conversation.count({ where: { blockedAt: { not: null } } });
  }

  /**
   * How many turns carry each safety tag in the window.
   *
   * One pass over the tagged rows rather than a count per tag: the tags are a
   * Postgres array, so a per-tag query is a per-tag sequential scan, and the
   * §8.3 counters are read together or not at all.
   */
  async countSafetyTags(since: Date): Promise<Record<string, number>> {
    const rows = await this.prismaService.conversationMessage.findMany({
      where: { createdAt: { gte: since }, NOT: { safetyTags: { isEmpty: true } } },
      select: { safetyTags: true },
    });
    const counts: Record<string, number> = {};
    for (const row of rows) {
      for (const tag of row.safetyTags) {
        counts[tag] = (counts[tag] ?? 0) + 1;
      }
    }
    return counts;
  }

  /**
   * Which tools ran, and how often, from the persisted tool-invocation turns.
   *
   * `PCS-T07` writes one `SYSTEM` turn per executed tool call tagged
   * `tool_invocation`, carrying the invocation as JSON. Those rows are audit
   * — excluded from the model's replay window — and this is the second thing
   * they pay for: the intent mix §8.4 asks for, with no new instrumentation.
   *
   * A row whose JSON does not parse is skipped rather than throwing. This is a
   * dashboard; one malformed audit row must not take out the number next to
   * it.
   */
  async countToolInvocations(since: Date): Promise<{
    intentMix: Record<string, number>;
    faqSearches: number;
    faqNoHits: number;
  }> {
    const rows = await this.prismaService.conversationMessage.findMany({
      where: { createdAt: { gte: since }, safetyTags: { has: 'tool_invocation' } },
      select: { content: true },
    });
    const intentMix: Record<string, number> = {};
    let faqSearches = 0;
    let faqNoHits = 0;
    for (const row of rows) {
      const invocation = this.parseInvocation(row.content);
      if (invocation === null) {
        continue;
      }
      intentMix[invocation.toolName] = (intentMix[invocation.toolName] ?? 0) + 1;
      if (invocation.toolName !== 'search_faq') {
        continue;
      }
      faqSearches += 1;
      // A FAQ search that returned nothing is the corpus-improvement signal
      // §8.4 wants: the questions the clinic's own documents could not answer
      // are the next documents to write.
      if (invocation.passageCount === 0) {
        faqNoHits += 1;
      }
    }
    return { intentMix, faqSearches, faqNoHits };
  }

  private parseInvocation(
    content: string,
  ): { toolName: string; passageCount: number | null } | null {
    try {
      const parsed = JSON.parse(content) as Record<string, unknown>;
      const toolName = parsed.toolName;
      if (typeof toolName !== 'string') {
        return null;
      }
      const resultCount = parsed.resultCount;
      return {
        toolName,
        passageCount: typeof resultCount === 'number' ? resultCount : null,
      };
    } catch {
      return null;
    }
  }
}
