import { createClinicDocumentUploadUrlSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CreateClinicDocumentUploadUrlDto extends createZodDto(
  createClinicDocumentUploadUrlSchema,
) {}
