import { createRoomSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CreateRoomDto extends createZodDto(createRoomSchema) {}
