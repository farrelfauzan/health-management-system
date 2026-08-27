import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AdminManagementController } from './controller/admin-management.controller';
import { AdminManagementRepository } from './repository/admin-management.repository';
import { AdminManagementService } from './service/admin-management.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminManagementController],
  providers: [AdminManagementRepository, AdminManagementService],
  // The repository is exported for `UserInvitationModule` (IMP-23), which asks
  // the same three questions this module already answers — does this email
  // exist, do these role codes exist, what are their ids — on the accept path.
  // Cross-module access still goes through this module's own boundary rather
  // than a second Prisma caller for `user` and `role`.
  exports: [AdminManagementRepository],
})
export class AdminManagementModule {}
