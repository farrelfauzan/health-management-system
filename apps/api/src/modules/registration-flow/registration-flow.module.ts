import { Module } from '@nestjs/common';

import { AppointmentManagementModule } from '../appointment-management/appointment-management.module';
import { AuthModule } from '../auth/auth.module';
import { PrivacyNoticeModule } from '../../common/privacy-notice/privacy-notice.module';
import { RegistrationFlowController } from './controller/registration-flow.controller';
import { QueueNumberAllocatorRepository } from './repository/queue-number-allocator.repository';
import { RegistrationFlowRepository } from './repository/registration-flow.repository';
import { RegistrationFlowService } from './service/registration-flow.service';

/**
 * `AppointmentManagementModule` arrives with `P19-T16`: the check-in rule asks
 * that module's service whether the doctor is practising, service to service
 * and never through its repository, so "what counts as a session today" is
 * decided in one place — cancelled sessions and standing schedules included.
 */
@Module({
  imports: [AppointmentManagementModule, AuthModule, PrivacyNoticeModule],
  controllers: [RegistrationFlowController],
  providers: [QueueNumberAllocatorRepository, RegistrationFlowRepository, RegistrationFlowService],
  exports: [RegistrationFlowService],
})
export class RegistrationFlowModule {}
