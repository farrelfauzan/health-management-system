import { voidInvoiceSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class VoidInvoiceDto extends createZodDto(voidInvoiceSchema) {}
