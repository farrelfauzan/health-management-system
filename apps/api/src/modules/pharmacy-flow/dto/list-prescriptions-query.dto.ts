import { listPrescriptionsQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListPrescriptionsQueryDto extends createZodDto(listPrescriptionsQuerySchema) {}
