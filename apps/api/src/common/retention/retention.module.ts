import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { resolveRmeRetentionYears } from './retention.config';
import { RetentionConfig } from './retention.types';

export const RETENTION_CONFIG = Symbol('RETENTION_CONFIG');

@Module({
  providers: [
    {
      provide: RETENTION_CONFIG,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): RetentionConfig => ({
        rmeRetentionYears: resolveRmeRetentionYears(configService),
      }),
    },
  ],
  exports: [RETENTION_CONFIG],
})
export class RetentionModule {}
