import { listTaxAssignmentsQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListTaxAssignmentsQueryDto extends createZodDto(listTaxAssignmentsQuerySchema) {}
