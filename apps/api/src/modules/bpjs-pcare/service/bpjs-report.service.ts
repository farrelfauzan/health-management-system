import { Injectable } from '@nestjs/common';

import {
  BPJS_SUBMISSION_TYPES,
  BpjsMonthlyReportView,
  BpjsSubmissionRecord,
  MonthlyBpjsReportQueryInput,
} from '@hms/shared-types';

import { BpjsSubmissionRepository } from '../repository/bpjs-submission.repository';

/**
 * The monthly tercatat/terkirim/gagal reconciliation (P11-T06). BPJS claims
 * close per calendar month, so the report answers the one question that
 * matters before the deadline: of the JKN visits recorded that month, which
 * submissions reached PCare and which need an admin before the window
 * shuts. Counts come straight from the outbox — recorded is everything
 * enqueued, so recorded − submitted − failed = still pending.
 */
@Injectable()
export class BpjsReportService {
  constructor(private readonly submissionRepository: BpjsSubmissionRepository) {}

  async getMonthlyReport(query: MonthlyBpjsReportQueryInput): Promise<BpjsMonthlyReportView> {
    const monthStart = parseMonthStart(query.month);
    const monthEnd = addOneMonth(monthStart);
    const reconciliation = await this.submissionRepository.findMonthlyReconciliation(
      monthStart,
      monthEnd,
    );
    return {
      month: query.month,
      types: BPJS_SUBMISSION_TYPES.map((type) => {
        const countFor = (status: string): number =>
          reconciliation.counts
            .filter((entry) => entry.type === type && entry.status === status)
            .reduce((total, entry) => total + entry.count, 0);
        const submitted = countFor('SUBMITTED');
        const pending = countFor('PENDING');
        const failed = countFor('FAILED');
        return { type, recorded: submitted + pending + failed, submitted, pending, failed };
      }),
      failures: reconciliation.failures.map((record) => this.toFailureView(record)),
    };
  }

  private toFailureView(record: BpjsSubmissionRecord) {
    return {
      submissionId: record.id,
      registrationId: record.registrationId,
      type: record.type,
      attempts: record.attempts,
      lastError: record.lastError,
      lastAttemptAt: record.lastAttemptAt === null ? null : record.lastAttemptAt.toISOString(),
    };
  }
}

function parseMonthStart(month: string): Date {
  const [yearPart = '', monthPart = ''] = month.split('-');
  return new Date(Date.UTC(Number(yearPart), Number(monthPart) - 1, 1));
}

function addOneMonth(monthStart: Date): Date {
  return new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1),
  );
}
