import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { NotificationModule } from '../notification/notification.module';
import { DoctorPatientController } from './controller/doctor-patient.controller';
import { DoctorPatientRepository } from './repository/doctor-patient.repository';
import { DoctorPatientService } from './service/doctor-patient.service';
import { PatientAssignmentNotificationService } from './service/patient-assignment-notification.service';

@Module({
  imports: [AuthModule, NotificationModule],
  controllers: [DoctorPatientController],
  providers: [DoctorPatientRepository, DoctorPatientService, PatientAssignmentNotificationService],
  // Exported for `AppointmentManagementService`, which puts an appointment's
  // doctor on the patient's care team. The service is exported rather than the
  // repository because the repo contract is explicit that a module reaches
  // another module's tables through its service — and because the permission
  // check lives on the service, which is what keeps this side effect subject
  // to the same grant a hand-made assignment needs.
  // The assignment notifier goes out too, for `PatientManagementService`: a
  // patient registered with `doctorIds` writes its assignments in the create
  // transaction, and the clinicians it names are told the same way (D-048).
  exports: [DoctorPatientService, PatientAssignmentNotificationService],
})
export class DoctorPatientModule {}
