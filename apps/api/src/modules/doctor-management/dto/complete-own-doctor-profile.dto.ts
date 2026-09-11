import { completeOwnDoctorProfileSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CompleteOwnDoctorProfileDto extends createZodDto(completeOwnDoctorProfileSchema) {}
