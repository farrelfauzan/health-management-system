import { createDocumentTemplateImportUploadUrlSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CreateDocumentTemplateImportUploadUrlDto extends createZodDto(
  createDocumentTemplateImportUploadUrlSchema,
) {}
