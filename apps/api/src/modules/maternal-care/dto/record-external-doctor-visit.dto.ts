import { recordExternalDoctorVisitSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class RecordExternalDoctorVisitDto extends createZodDto(recordExternalDoctorVisitSchema) {}
