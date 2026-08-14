import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { DoctorPatientModule } from '../doctor-patient/doctor-patient.module';
import { AppointmentManagementController } from './controller/appointment-management.controller';
import { AppointmentSessionController } from './controller/appointment-session.controller';
import { AppointmentManagementRepository } from './repository/appointment-management.repository';
import { AppointmentManagementService } from './service/appointment-management.service';

@Module({
  imports: [AuthModule, DoctorPatientModule],
  controllers: [AppointmentManagementController, AppointmentSessionController],
  providers: [AppointmentManagementRepository, AppointmentManagementService],
  exports: [AppointmentManagementService],
})
export class AppointmentManagementModule {}
