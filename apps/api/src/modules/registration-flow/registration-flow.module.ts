import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { RegistrationFlowController } from './controller/registration-flow.controller';
import { QueueNumberAllocatorRepository } from './repository/queue-number-allocator.repository';
import { RegistrationFlowRepository } from './repository/registration-flow.repository';
import { RegistrationFlowService } from './service/registration-flow.service';

@Module({
  imports: [AuthModule],
  controllers: [RegistrationFlowController],
  providers: [QueueNumberAllocatorRepository, RegistrationFlowRepository, RegistrationFlowService],
})
export class RegistrationFlowModule {}
