import { createDoctorPatientAssignmentSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CreateDoctorPatientAssignmentDto extends createZodDto(
  createDoctorPatientAssignmentSchema,
) {}
