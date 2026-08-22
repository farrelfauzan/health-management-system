import { updateRoomSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdateRoomDto extends createZodDto(updateRoomSchema) {}
