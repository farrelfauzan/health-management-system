import { exportManagedDocumentsQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ExportManagedDocumentsQueryDto extends createZodDto(
  exportManagedDocumentsQuerySchema,
) {}
