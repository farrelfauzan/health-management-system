import { listDistrictsQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListDistrictsQueryDto extends createZodDto(listDistrictsQuerySchema) {}
