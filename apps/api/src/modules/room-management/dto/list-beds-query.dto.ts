import { listBedsQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListBedsQueryDto extends createZodDto(listBedsQuerySchema) {}
