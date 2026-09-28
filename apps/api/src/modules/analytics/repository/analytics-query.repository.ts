import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { RunAnalyticsQueryOptions } from '@hms/shared-types';

import { PrismaService } from '../../../common/prisma/prisma.service';
import type { PrismaTransactionClient } from '../../../common/prisma/prisma.types';
import { isStatementTimeoutError } from '../../../common/prisma/is-statement-timeout-error';

const DEFAULT_STATEMENT_TIMEOUT_MS = 10_000;
const TRANSACTION_HEADROOM_MS = 5_000;

/**
 * The only door analytics has to the database (D-049): every aggregate runs
 * in a read-only transaction whose statements Postgres cancels after ten
 * seconds (PRD NFR-AN-03), so a heavy dashboard cannot hold a connection the
 * front desk needs. A cancelled statement becomes `ANALYTICS_QUERY_TIMEOUT`,
 * never a 500.
 *
 * Read-only is enforced by Postgres, not by convention: a write inside the
 * callback fails with "cannot execute … in a read-only transaction".
 */
@Injectable()
export class AnalyticsQueryRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Runs `work` in a read-only transaction under a statement timeout. */
  async runReadOnly<TResult>(
    work: (tx: PrismaTransactionClient) => Promise<TResult>,
    { statementTimeoutMs = DEFAULT_STATEMENT_TIMEOUT_MS }: RunAnalyticsQueryOptions = {},
  ): Promise<TResult> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
          await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${Math.trunc(statementTimeoutMs)}`);
          return work(tx);
        },
        // Prisma's own interactive-transaction limit is 5 s; left at the
        // default it would abort a query Postgres was still allowed to run.
        { timeout: statementTimeoutMs + TRANSACTION_HEADROOM_MS },
      );
    } catch (error: unknown) {
      if (isStatementTimeoutError(error)) {
        throw new ServiceUnavailableException({
          code: 'ANALYTICS_QUERY_TIMEOUT',
          message: 'This report took too long to prepare. Try a shorter date range.',
        });
      }
      throw error;
    }
  }
}
