import { Module, forwardRef } from '@nestjs/common';

import { AdminManagementModule } from '../admin-management/admin-management.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationModule } from '../notification/notification.module';
import { UserInvitationModule } from '../user-invitation/user-invitation.module';
import { DoctorCredentialOptionController } from './controller/doctor-credential-option.controller';
import { DoctorLicenseExpiryController } from './controller/doctor-license-expiry.controller';
import { DoctorManagementController } from './controller/doctor-management.controller';
import { DoctorOwnProfileController } from './controller/doctor-own-profile.controller';
import { DoctorCredentialOptionRepository } from './repository/doctor-credential-option.repository';
import { DoctorLicenseExpiryRepository } from './repository/doctor-license-expiry.repository';
import { DoctorManagementRepository } from './repository/doctor-management.repository';
import { DoctorCredentialOptionService } from './service/doctor-credential-option.service';
import { DoctorLicenseExpiryService } from './service/doctor-license-expiry.service';
import { DoctorLicenseExpiryWorker } from './service/doctor-license-expiry.worker';
import { DoctorManagementService } from './service/doctor-management.service';
import { DoctorOwnProfileService } from './service/doctor-own-profile.service';
import { DoctorProfileCompletionService } from './service/doctor-profile-completion.service';

/**
 * Exports `DoctorLicenseExpiryService` because the scheduling warning
 * (`P16-T20`) reads lapsed licences from the appointment module. Cross-module
 * access goes through the service, never the repository, so the scheduler and
 * the dashboard resolve "expired" by the same rule — including the clinic
 * timezone the day boundary is counted in.
 *
 * Exports `DoctorOwnProfileService` for the same reason (P20-T03): "which
 * doctor profile is the signed-in user's" is asked again by P21-T04, and it
 * must be answered by one rule rather than a second `ownerUserId` lookup.
 */
@Module({
  imports: [
    AuthModule,
    NotificationModule,
    // `forwardRef` on both because P19-T15 closes a loop that already ran most
    // of the way round the application: `AdminManagementModule` reaches
    // `AppointmentManagementModule` through the document and channel modules,
    // and that one imports this module for the scheduling warning. Creating a
    // doctor's login is genuinely this module's business, so the edge is real
    // rather than a layering slip — `UserInvitationModule` gets the same
    // treatment because it imports `AdminManagementModule` and would otherwise
    // be evaluated mid-loop for the same reason.
    forwardRef(() => AdminManagementModule),
    forwardRef(() => UserInvitationModule),
  ],
  controllers: [
    DoctorManagementController,
    DoctorOwnProfileController,
    DoctorLicenseExpiryController,
    DoctorCredentialOptionController,
  ],
  providers: [
    DoctorManagementRepository,
    DoctorManagementService,
    DoctorOwnProfileService,
    DoctorProfileCompletionService,
    DoctorLicenseExpiryRepository,
    DoctorLicenseExpiryService,
    DoctorLicenseExpiryWorker,
    DoctorCredentialOptionRepository,
    DoctorCredentialOptionService,
  ],
  exports: [DoctorLicenseExpiryService, DoctorOwnProfileService],
})
export class DoctorManagementModule {}
