import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { NotionModule } from '../../common/notion/notion.module';
import { AiChatbotModule } from '../ai-chatbot/ai-chatbot.module';
import { NotificationModule } from '../notification/notification.module';
import { BUG_REPORT_PUBLISH_CONFIG, BUG_REPORT_TRIAGE_CONFIG } from './bug-report-config.token';
import { resolveBugReportPublishConfig } from './bug-report-publish.config';
import { resolveBugReportTriageConfig } from './bug-report-triage.config';
import { BugReportPublishConfig, BugReportTriageConfig } from './bug-report-triage.types';
import { BugReportController } from './controller/bug-report.controller';
import { BugReportRepository } from './repository/bug-report.repository';
import { BugReportPublishService } from './service/bug-report-publish.service';
import { BugReportPublishWorker } from './service/bug-report-publish.worker';
import { BugReportTriageService } from './service/bug-report-triage.service';
import { BugReportTriageWorker } from './service/bug-report-triage.worker';
import { BugReportService } from './service/bug-report.service';

/**
 * Bug reporting, end to end (P23-T08 → P23-T10): a member of clinic staff
 * describes what broke, the report waits here as an outbox row, the triage
 * worker turns it into ticket content, and the publish worker puts it on Saling
 * Jaga's Notion Bug Board.
 *
 * Patients are deliberately not reporters — the permission is granted to staff
 * roles and nothing else.
 *
 * Both configurations are resolved in provider factories, which run while Nest
 * builds the injector: a half-set `BUG_TRIAGE_AI_*` credential, or a Notion token
 * with no clinic label, kills the process at boot with a message naming the
 * variable rather than surfacing as a failed report hours later.
 *
 * `AiChatbotModule` is imported for `AiProviderRegistry` — the adapters, and
 * nothing else. Triage explicitly does **not** use the clinic's
 * `AiProviderConfig` row (§5c): that is the clinic's chat provider, on the
 * clinic's bill, under a DPA written for chat, and switchable off. A bug report
 * has to reach us precisely when the clinic has switched things off, so triage
 * runs on Saling Jaga's own `BUG_TRIAGE_AI_*` key or falls back to publishing the
 * reporter's redacted words.
 */
@Module({
  imports: [AiChatbotModule, NotificationModule, NotionModule],
  controllers: [BugReportController],
  providers: [
    {
      provide: BUG_REPORT_TRIAGE_CONFIG,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): BugReportTriageConfig =>
        resolveBugReportTriageConfig(configService),
    },
    {
      provide: BUG_REPORT_PUBLISH_CONFIG,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): BugReportPublishConfig =>
        resolveBugReportPublishConfig(configService),
    },
    BugReportService,
    BugReportRepository,
    BugReportTriageService,
    BugReportTriageWorker,
    BugReportPublishService,
    BugReportPublishWorker,
  ],
  exports: [BugReportService, BugReportRepository],
})
export class BugReportModule {}
