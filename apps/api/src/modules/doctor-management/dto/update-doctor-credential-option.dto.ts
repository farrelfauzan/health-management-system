import { updateDoctorCredentialOptionSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdateDoctorCredentialOptionDto extends createZodDto(updateDoctorCredentialOptionSchema) {}
