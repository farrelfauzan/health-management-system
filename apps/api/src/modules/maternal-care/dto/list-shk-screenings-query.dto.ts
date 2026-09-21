import { listShkScreeningsQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListShkScreeningsQueryDto extends createZodDto(listShkScreeningsQuerySchema) {}
