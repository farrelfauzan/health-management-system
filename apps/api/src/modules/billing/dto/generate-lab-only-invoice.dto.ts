import { generateLabOnlyInvoiceSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class GenerateLabOnlyInvoiceDto extends createZodDto(generateLabOnlyInvoiceSchema) {}
