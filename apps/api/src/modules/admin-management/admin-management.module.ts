import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { DocumentManagementModule } from '../document-management/document-management.module';
import { AdminManagementController } from './controller/admin-management.controller';
import { UserOffboardingController } from './controller/user-offboarding.controller';
import { AdminManagementRepository } from './repository/admin-management.repository';
import { AdminManagementService } from './service/admin-management.service';
import { UserOffboardingService } from './service/user-offboarding.service';
import { UserOffboardingWorker } from './service/user-offboarding.worker';

/**
 * `DocumentManagementModule` is imported for `VaultOffboardingService`
 * (`P16-T41`): the count a super admin confirms against and the end-of-window
 * purge are the vault's business, reached through its service rather than by
 * a second Prisma caller for `documents` in this module.
 */
@Module({
  imports: [AuthModule, DocumentManagementModule],
  controllers: [AdminManagementController, UserOffboardingController],
  providers: [
    AdminManagementRepository,
    AdminManagementService,
    UserOffboardingService,
    UserOffboardingWorker,
  ],
  // The repository is exported for `UserInvitationModule` (IMP-23), which asks
  // the same three questions this module already answers — does this email
  // exist, do these role codes exist, what are their ids — on the accept path.
  // Cross-module access still goes through this module's own boundary rather
  // than a second Prisma caller for `user` and `role`.
  //
  // The service is exported for `DoctorManagementModule` (P19-T15), which needs
  // a *write*: attaching an existing account to a new doctor profile has to
  // leave that account holding DOCTOR. A write is a rule, not a lookup, so that
  // one goes through the service — `grantRoleCodes` — and not the repository.
  exports: [AdminManagementRepository, AdminManagementService],
})
export class AdminManagementModule {}
