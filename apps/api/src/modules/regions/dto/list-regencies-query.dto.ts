import { listRegenciesQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListRegenciesQueryDto extends createZodDto(listRegenciesQuerySchema) {}
