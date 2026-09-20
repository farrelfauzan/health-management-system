import { bulkAssignTaxCodeSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class BulkAssignTaxCodeDto extends createZodDto(bulkAssignTaxCodeSchema) {}
