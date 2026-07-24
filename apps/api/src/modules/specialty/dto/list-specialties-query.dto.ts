import { listSpecialtiesQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListSpecialtiesQueryDto extends createZodDto(listSpecialtiesQuerySchema) {}
