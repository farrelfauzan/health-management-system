import { admitPatientSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class AdmitPatientDto extends createZodDto(admitPatientSchema) {}
