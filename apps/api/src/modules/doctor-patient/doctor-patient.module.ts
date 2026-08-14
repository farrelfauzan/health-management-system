import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { DoctorPatientController } from './controller/doctor-patient.controller';
import { DoctorPatientRepository } from './repository/doctor-patient.repository';
import { DoctorPatientService } from './service/doctor-patient.service';

@Module({
  imports: [AuthModule],
  controllers: [DoctorPatientController],
  providers: [DoctorPatientRepository, DoctorPatientService],
  // Exported for `AppointmentManagementService`, which puts an appointment's
  // doctor on the patient's care team. The service is exported rather than the
  // repository because the repo contract is explicit that a module reaches
  // another module's tables through its service — and because the permission
  // check lives on the service, which is what keeps this side effect subject
  // to the same grant a hand-made assignment needs.
  exports: [DoctorPatientService],
})
export class DoctorPatientModule {}
