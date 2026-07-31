import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrivacyNoticeModule } from '../../common/privacy-notice/privacy-notice.module';
import { RegistrationFlowController } from './controller/registration-flow.controller';
import { QueueNumberAllocatorRepository } from './repository/queue-number-allocator.repository';
import { RegistrationFlowRepository } from './repository/registration-flow.repository';
import { RegistrationFlowService } from './service/registration-flow.service';

@Module({
  imports: [AuthModule, PrivacyNoticeModule],
  controllers: [RegistrationFlowController],
  providers: [QueueNumberAllocatorRepository, RegistrationFlowRepository, RegistrationFlowService],
  exports: [RegistrationFlowService],
})
export class RegistrationFlowModule {}
