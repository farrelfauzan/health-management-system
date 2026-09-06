import { bulkApproveDocumentsSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class BulkApproveDocumentsDto extends createZodDto(bulkApproveDocumentsSchema) {}
