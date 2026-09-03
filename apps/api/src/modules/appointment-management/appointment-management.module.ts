import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { DoctorManagementModule } from '../doctor-management/doctor-management.module';
import { DoctorPatientModule } from '../doctor-patient/doctor-patient.module';
import { NotificationModule } from '../notification/notification.module';
import { AppointmentManagementController } from './controller/appointment-management.controller';
import { AppointmentSessionController } from './controller/appointment-session.controller';
import { AppointmentManagementRepository } from './repository/appointment-management.repository';
import { AppointmentManagementService } from './service/appointment-management.service';

/**
 * `DoctorManagementModule` arrives with `P16-T20`: the scheduling warning
 * reads lapsed STR/SIP from `DoctorLicenseExpiryService`, cross-module
 * service to service and never through its repository, so the scheduler and
 * the expiry dashboard resolve "expired" by one rule — clinic timezone
 * included.
 */
@Module({
  imports: [AuthModule, DoctorManagementModule, DoctorPatientModule, NotificationModule],
  controllers: [AppointmentManagementController, AppointmentSessionController],
  providers: [AppointmentManagementRepository, AppointmentManagementService],
  exports: [AppointmentManagementService],
})
export class AppointmentManagementModule {}
