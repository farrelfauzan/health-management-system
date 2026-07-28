import { cashierDailyReportQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CashierDailyReportQueryDto extends createZodDto(cashierDailyReportQuerySchema) {}
