import { createPatientDocumentUploadUrlSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CreatePatientDocumentUploadUrlDto extends createZodDto(
  createPatientDocumentUploadUrlSchema,
) {}
