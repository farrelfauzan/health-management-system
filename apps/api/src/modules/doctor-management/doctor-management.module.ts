import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { DoctorManagementController } from './controller/doctor-management.controller';
import { DoctorManagementRepository } from './repository/doctor-management.repository';
import { DoctorManagementService } from './service/doctor-management.service';

@Module({
  imports: [AuthModule],
  controllers: [DoctorManagementController],
  providers: [DoctorManagementRepository, DoctorManagementService],
})
export class DoctorManagementModule {}
