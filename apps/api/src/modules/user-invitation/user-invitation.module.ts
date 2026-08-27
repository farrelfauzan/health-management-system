import { Module } from '@nestjs/common';

import { AdminManagementModule } from '../admin-management/admin-management.module';
import { AuthModule } from '../auth/auth.module';
import { UserInvitationAdminController } from './controller/user-invitation-admin.controller';
import { UserInvitationPublicController } from './controller/user-invitation-public.controller';
import { UserInvitationRepository } from './repository/user-invitation.repository';
import { UserInvitationService } from './service/user-invitation.service';

@Module({
  imports: [AdminManagementModule, AuthModule],
  controllers: [UserInvitationAdminController, UserInvitationPublicController],
  providers: [UserInvitationService, UserInvitationRepository],
  exports: [UserInvitationService],
})
export class UserInvitationModule {}
