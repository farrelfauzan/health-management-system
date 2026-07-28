import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { Icd9cmCodeController } from './controller/icd9cm-code.controller';
import { Icd10CodeController } from './controller/icd10-code.controller';
import { Icd9cmCodeRepository } from './repository/icd9cm-code.repository';
import { Icd10CodeRepository } from './repository/icd10-code.repository';
import { Icd9cmCodeService } from './service/icd9cm-code.service';
import { Icd10CodeService } from './service/icd10-code.service';

@Module({
  imports: [AuthModule],
  controllers: [Icd10CodeController, Icd9cmCodeController],
  providers: [
    Icd10CodeRepository,
    Icd10CodeService,
    Icd9cmCodeRepository,
    Icd9cmCodeService,
  ],
  exports: [Icd10CodeService, Icd9cmCodeService],
})
export class TerminologyModule {}
