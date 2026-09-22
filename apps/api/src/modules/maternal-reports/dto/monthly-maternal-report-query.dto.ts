import { monthlyMaternalReportQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class MonthlyMaternalReportQueryDto extends createZodDto(monthlyMaternalReportQuerySchema) {}
