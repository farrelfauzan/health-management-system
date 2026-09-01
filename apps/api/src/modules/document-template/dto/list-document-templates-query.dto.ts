import { listDocumentTemplatesQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListDocumentTemplatesQueryDto extends createZodDto(
  listDocumentTemplatesQuerySchema,
) {}
