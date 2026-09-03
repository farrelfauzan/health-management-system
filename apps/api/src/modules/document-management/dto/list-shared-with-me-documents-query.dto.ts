import { listSharedWithMeDocumentsQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListSharedWithMeDocumentsQueryDto extends createZodDto(
  listSharedWithMeDocumentsQuerySchema,
) {}
