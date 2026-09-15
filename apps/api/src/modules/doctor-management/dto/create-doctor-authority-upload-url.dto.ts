import { createDoctorAuthorityUploadUrlSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CreateDoctorAuthorityUploadUrlDto extends createZodDto(
  createDoctorAuthorityUploadUrlSchema,
) {}
