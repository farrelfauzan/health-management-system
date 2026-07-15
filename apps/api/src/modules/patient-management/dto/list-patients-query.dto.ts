import { listPatientsQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListPatientsQueryDto extends createZodDto(listPatientsQuerySchema) {}
