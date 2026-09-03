import { downloadPatientDocumentQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class DownloadPatientDocumentQueryDto extends createZodDto(
  downloadPatientDocumentQuerySchema,
) {}
