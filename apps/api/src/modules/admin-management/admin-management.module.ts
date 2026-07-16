import { Module } from '@nestjs/common';

import { AdminManagementController } from './controller/admin-management.controller';
import { AdminManagementRepository } from './repository/admin-management.repository';
import { AdminManagementService } from './service/admin-management.service';

@Module({
  controllers: [AdminManagementController],
  providers: [AdminManagementRepository, AdminManagementService],
})
export class AdminManagementModule {}
