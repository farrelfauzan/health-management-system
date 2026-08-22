import { listWardsQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListWardsQueryDto extends createZodDto(listWardsQuerySchema) {}
