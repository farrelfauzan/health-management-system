import { analyticsExportQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class AnalyticsExportQueryDto extends createZodDto(analyticsExportQuerySchema) {}
