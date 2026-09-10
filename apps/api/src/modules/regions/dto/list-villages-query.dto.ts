import { listVillagesQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListVillagesQueryDto extends createZodDto(listVillagesQuerySchema) {}
