import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { NOTION_CONFIG } from './notion-config.token';
import { NotionHttpClient } from './notion-http.client';
import { resolveNotionConfig } from './notion.config';
import { NotionConfig } from './notion.types';

/**
 * Notion connector (P23-T02, P23-T03). Resolves the environment-only settings
 * once, at boot: the factory runs while Nest builds the injector, so a
 * half-set or malformed credential kills the process with a readable message
 * instead of surfacing as a 401 at the first bug report.
 *
 * A deployment with no Notion variables resolves cleanly with
 * `isConfigured: false` and starts normally.
 */
@Module({
  providers: [
    {
      provide: NOTION_CONFIG,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): NotionConfig =>
        resolveNotionConfig(configService),
    },
    NotionHttpClient,
  ],
  exports: [NOTION_CONFIG, NotionHttpClient],
})
export class NotionModule {}
