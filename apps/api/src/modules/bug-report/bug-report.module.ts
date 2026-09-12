import { Module } from '@nestjs/common';

import { BugReportController } from './controller/bug-report.controller';
import { BugReportRepository } from './repository/bug-report.repository';
import { BugReportService } from './service/bug-report.service';

/**
 * Bug reporting (P23-T08): a member of clinic staff describes what broke, and
 * the report waits here as an outbox row until the workers of P23-T09 and
 * P23-T10 turn it into a ticket on Saling Jaga's Notion Bug Board.
 *
 * Intake only, for now. Patients are deliberately not reporters — the
 * permission is granted to staff roles and nothing else.
 */
@Module({
  controllers: [BugReportController],
  providers: [BugReportService, BugReportRepository],
  exports: [BugReportService],
})
export class BugReportModule {}
