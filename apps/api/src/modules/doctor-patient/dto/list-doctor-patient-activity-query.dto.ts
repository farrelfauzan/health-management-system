import { listDoctorPatientActivityQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListDoctorPatientActivityQueryDto extends createZodDto(
  listDoctorPatientActivityQuerySchema,
) {}
