import { TaxReportKindValue } from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { TaxReminderKind } from '../../../generated/prisma/enums';

@Injectable()
export class TaxReminderRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Claims one reminder, returning false when it has already been raised
   * (P27-T10).
   *
   * The unique index does the deciding, not a read-then-write: two sweeps
   * overlapping — a restart while one is mid-flight — would both see nothing
   * and both announce. Letting the insert fail is the only version of this
   * that is true under concurrency.
   */
  async claimNotice(kind: TaxReminderKind, noticeKey: string): Promise<boolean> {
    const inserted = await this.prisma.taxReminderNotice.createMany({
      data: [{ kind, noticeKey }],
      skipDuplicates: true,
    });
    return inserted.count === 1;
  }

  /** Turnover for a calendar year, on the cash basis the PP 55 report uses. */
  async sumPaymentsInYear(range: { start: Date; end: Date }): Promise<number> {
    const aggregate = await this.prisma.payment.aggregate({
      where: { paidAt: { gte: range.start, lt: range.end } },
      _sum: { amount: true },
    });
    return Number(aggregate._sum.amount ?? 0);
  }

  /** The periods whose draft of this kind is FINALIZED, among those asked about. */
  async listFinalizedPeriods(
    periods: readonly string[],
    kind: TaxReportKindValue,
  ): Promise<string[]> {
    if (periods.length === 0) {
      return [];
    }
    const drafts = await this.prisma.taxReportDraft.findMany({
      where: { period: { in: [...periods] }, kind, status: 'FINALIZED' },
      select: { period: true },
    });
    return drafts.map((draft) => draft.period);
  }
}
