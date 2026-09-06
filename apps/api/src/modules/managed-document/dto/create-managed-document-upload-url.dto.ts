import { createManagedDocumentUploadUrlSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CreateManagedDocumentUploadUrlDto extends createZodDto(
  createManagedDocumentUploadUrlSchema,
) {}
