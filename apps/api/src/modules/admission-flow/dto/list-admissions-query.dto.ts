import { listAdmissionsQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListAdmissionsQueryDto extends createZodDto(listAdmissionsQuerySchema) {}
