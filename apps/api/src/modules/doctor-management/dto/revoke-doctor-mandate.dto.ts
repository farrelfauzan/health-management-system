import { revokeDoctorMandateSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class RevokeDoctorMandateDto extends createZodDto(revokeDoctorMandateSchema) {}
