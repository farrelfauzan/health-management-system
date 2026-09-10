import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrivacyNoticeModule } from '../../common/privacy-notice/privacy-notice.module';
import { RegionsModule } from '../regions/regions.module';
import { PatientManagementController } from './controller/patient-management.controller';
import { PatientManagementRepository } from './repository/patient-management.repository';
import { PatientManagementService } from './service/patient-management.service';

@Module({
  imports: [AuthModule, PrivacyNoticeModule, RegionsModule],
  controllers: [PatientManagementController],
  providers: [PatientManagementRepository, PatientManagementService],
  exports: [PatientManagementService],
})
export class PatientManagementModule {}
