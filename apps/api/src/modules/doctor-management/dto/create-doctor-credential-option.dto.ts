import { createDoctorCredentialOptionSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CreateDoctorCredentialOptionDto extends createZodDto(createDoctorCredentialOptionSchema) {}
