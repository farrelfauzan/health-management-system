import { listDocumentApprovalsQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListDocumentApprovalsQueryDto extends createZodDto(
  listDocumentApprovalsQuerySchema,
) {}
