import { addInvoiceItemSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class AddInvoiceItemDto extends createZodDto(addInvoiceItemSchema) {}
