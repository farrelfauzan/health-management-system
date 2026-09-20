import { createTaxReportSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CreateTaxReportDto extends createZodDto(createTaxReportSchema) {}
