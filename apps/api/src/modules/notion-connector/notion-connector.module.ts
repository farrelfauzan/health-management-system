import { Module } from '@nestjs/common';

import { NotionModule } from '../../common/notion/notion.module';
import { NotionConnectorController } from './controller/notion-connector.controller';
import { NotionConnectorService } from './service/notion-connector.service';

/**
 * The operator's window onto the Notion bug-report connector (P23-T04):
 * status, and a test that reads the Bug Board's schema. Deliberately
 * read-only — the configuration is environment-only (P23-T02), so there is
 * nothing here for a clinic administrator to change.
 */
@Module({
  imports: [NotionModule],
  controllers: [NotionConnectorController],
  providers: [NotionConnectorService],
  exports: [NotionConnectorService],
})
export class NotionConnectorModule {}
