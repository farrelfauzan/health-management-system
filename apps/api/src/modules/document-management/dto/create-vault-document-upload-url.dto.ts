import { createVaultDocumentUploadUrlSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CreateVaultDocumentUploadUrlDto extends createZodDto(
  createVaultDocumentUploadUrlSchema,
) {}
