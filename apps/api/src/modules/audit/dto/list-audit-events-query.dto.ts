import { listAuditEventsQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListAuditEventsQueryDto extends createZodDto(listAuditEventsQuerySchema) {}
