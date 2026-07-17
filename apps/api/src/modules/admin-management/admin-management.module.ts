import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AdminManagementController } from './controller/admin-management.controller';
import { AdminManagementRepository } from './repository/admin-management.repository';
import { AdminManagementService } from './service/admin-management.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminManagementController],
  providers: [AdminManagementRepository, AdminManagementService],
})
export class AdminManagementModule {}
