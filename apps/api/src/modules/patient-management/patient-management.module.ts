import { Module } from '@nestjs/common';

import { SatusehatModule } from '../../common/satusehat/satusehat.module';
import { AuthModule } from '../auth/auth.module';
import { PrivacyNoticeModule } from '../../common/privacy-notice/privacy-notice.module';
import { RegionsModule } from '../regions/regions.module';
import { PatientManagementController } from './controller/patient-management.controller';
import { PatientManagementRepository } from './repository/patient-management.repository';
import { NewbornSatusehatNikService } from './service/newborn-satusehat-nik.service';
import { PatientManagementService } from './service/patient-management.service';

@Module({
  // The common SATUSEHAT adapter, not the integration feature module: a
  // newborn's first NIK is patched upstream from here (P24-T13), and the
  // adapter is the layer feature modules are meant to inject.
  imports: [AuthModule, PrivacyNoticeModule, RegionsModule, SatusehatModule],
  controllers: [PatientManagementController],
  providers: [PatientManagementRepository, PatientManagementService, NewbornSatusehatNikService],
  exports: [PatientManagementService],
})
export class PatientManagementModule {}
