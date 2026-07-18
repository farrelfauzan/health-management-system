import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AppointmentManagementController } from './controller/appointment-management.controller';
import { AppointmentManagementRepository } from './repository/appointment-management.repository';
import { AppointmentManagementService } from './service/appointment-management.service';

@Module({
  imports: [AuthModule],
  controllers: [AppointmentManagementController],
  providers: [AppointmentManagementRepository, AppointmentManagementService],
})
export class AppointmentManagementModule {}
