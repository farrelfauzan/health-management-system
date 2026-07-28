import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { Icd10CodeController } from './controller/icd10-code.controller';
import { Icd10CodeRepository } from './repository/icd10-code.repository';
import { Icd10CodeService } from './service/icd10-code.service';

@Module({
  imports: [AuthModule],
  controllers: [Icd10CodeController],
  providers: [Icd10CodeRepository, Icd10CodeService],
  exports: [Icd10CodeService],
})
export class TerminologyModule {}
