import { Module } from '@nestjs/common';

import { PrivacyNoticeRepository } from './privacy-notice.repository';

@Module({
  providers: [PrivacyNoticeRepository],
  exports: [PrivacyNoticeRepository],
})
export class PrivacyNoticeModule {}
