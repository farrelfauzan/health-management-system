import { listEncountersQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListEncountersQueryDto extends createZodDto(listEncountersQuerySchema) {}
