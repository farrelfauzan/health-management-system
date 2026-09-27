import { analyticsFilterSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class AnalyticsFilterQueryDto extends createZodDto(analyticsFilterSchema) {}
