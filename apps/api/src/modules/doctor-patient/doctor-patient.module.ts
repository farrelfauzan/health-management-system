import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { DoctorPatientController } from './controller/doctor-patient.controller';
import { DoctorPatientRepository } from './repository/doctor-patient.repository';
import { DoctorPatientService } from './service/doctor-patient.service';

@Module({
  imports: [AuthModule],
  controllers: [DoctorPatientController],
  providers: [DoctorPatientRepository, DoctorPatientService],
})
export class DoctorPatientModule {}
