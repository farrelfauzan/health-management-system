import { createPersonalDocumentUploadUrlSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CreatePersonalDocumentUploadUrlDto extends createZodDto(
  createPersonalDocumentUploadUrlSchema,
) {}
