import { expiryReportQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ExpiryReportQueryDto extends createZodDto(expiryReportQuerySchema) {}
