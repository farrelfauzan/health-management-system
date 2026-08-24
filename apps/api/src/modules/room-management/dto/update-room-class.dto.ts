import { updateRoomClassSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdateRoomClassDto extends createZodDto(updateRoomClassSchema) {}
