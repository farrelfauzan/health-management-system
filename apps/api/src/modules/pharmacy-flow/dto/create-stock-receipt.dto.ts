import { createStockReceiptSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CreateStockReceiptDto extends createZodDto(createStockReceiptSchema) {}
