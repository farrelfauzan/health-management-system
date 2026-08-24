import { listRoomClassesQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListRoomClassesQueryDto extends createZodDto(listRoomClassesQuerySchema) {}
