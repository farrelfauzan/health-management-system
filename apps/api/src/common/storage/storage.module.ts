import { Module } from '@nestjs/common';

import { ObjectStorageService } from './object-storage.service';
import { S3StorageService } from './s3-storage.service';

/**
 * Registers the provider-neutral object-storage contract backed by the S3
 * adapter. Feature modules import this module and inject
 * {@link ObjectStorageService}; they never depend on AWS SDK clients directly.
 */
@Module({
  providers: [
    {
      provide: ObjectStorageService,
      useClass: S3StorageService,
    },
  ],
  exports: [ObjectStorageService],
})
export class StorageModule {}
