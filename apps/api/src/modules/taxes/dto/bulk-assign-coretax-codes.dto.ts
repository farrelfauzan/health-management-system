import { bulkAssignCoretaxCodesSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class BulkAssignCoretaxCodesDto extends createZodDto(bulkAssignCoretaxCodesSchema) {}
