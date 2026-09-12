import { Module } from '@nestjs/common';

import { NotionModule } from '../../common/notion/notion.module';
import { BugReportModule } from '../bug-report/bug-report.module';
import { NotionConnectorController } from './controller/notion-connector.controller';
import { NotionConnectorService } from './service/notion-connector.service';

/**
 * The operator's window onto the Notion bug-report connector (P23-T04):
 * status, and a test that reads the Bug Board's schema. Deliberately
 * read-only — the configuration is environment-only (P23-T02), so there is
 * nothing here for a clinic administrator to change. P23-T10 adds when a report
 * last reached the board, which is the only value on the card that tells a
 * working pipeline from a merely configured one.
 */
@Module({
  // `BugReportModule` for that timestamp — its *service*, never its repository.
  // The dependency runs this way round on purpose: the connector owns the card,
  // and bug reporting owns what a bug report is.
  imports: [NotionModule, BugReportModule],
  controllers: [NotionConnectorController],
  providers: [NotionConnectorService],
  exports: [NotionConnectorService],
})
export class NotionConnectorModule {}
