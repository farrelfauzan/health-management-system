import { monthlyBpjsReportQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class MonthlyBpjsReportQueryDto extends createZodDto(monthlyBpjsReportQuerySchema) {}
