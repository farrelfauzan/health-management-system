import { listStockReceiptsQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListStockReceiptsQueryDto extends createZodDto(listStockReceiptsQuerySchema) {}
