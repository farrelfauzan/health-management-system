import { listRoomsQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListRoomsQueryDto extends createZodDto(listRoomsQuerySchema) {}
