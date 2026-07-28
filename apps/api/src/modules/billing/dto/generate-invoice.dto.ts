import { generateInvoiceSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class GenerateInvoiceDto extends createZodDto(generateInvoiceSchema) {}
