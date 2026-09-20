import { listTaxReportsQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListTaxReportsQueryDto extends createZodDto(listTaxReportsQuerySchema) {}
