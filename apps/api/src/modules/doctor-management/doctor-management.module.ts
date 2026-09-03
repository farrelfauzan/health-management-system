import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { NotificationModule } from '../notification/notification.module';
import { DoctorLicenseExpiryController } from './controller/doctor-license-expiry.controller';
import { DoctorManagementController } from './controller/doctor-management.controller';
import { DoctorLicenseExpiryRepository } from './repository/doctor-license-expiry.repository';
import { DoctorManagementRepository } from './repository/doctor-management.repository';
import { DoctorLicenseExpiryService } from './service/doctor-license-expiry.service';
import { DoctorLicenseExpiryWorker } from './service/doctor-license-expiry.worker';
import { DoctorManagementService } from './service/doctor-management.service';

/**
 * Exports `DoctorLicenseExpiryService` because the scheduling warning
 * (`P16-T20`) reads lapsed licences from the appointment module. Cross-module
 * access goes through the service, never the repository, so the scheduler and
 * the dashboard resolve "expired" by the same rule — including the clinic
 * timezone the day boundary is counted in.
 */
@Module({
  imports: [AuthModule, NotificationModule],
  controllers: [DoctorManagementController, DoctorLicenseExpiryController],
  providers: [
    DoctorManagementRepository,
    DoctorManagementService,
    DoctorLicenseExpiryRepository,
    DoctorLicenseExpiryService,
    DoctorLicenseExpiryWorker,
  ],
  exports: [DoctorLicenseExpiryService],
})
export class DoctorManagementModule {}
