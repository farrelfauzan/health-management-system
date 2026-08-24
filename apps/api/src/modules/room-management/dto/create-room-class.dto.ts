import { createRoomClassSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CreateRoomClassDto extends createZodDto(createRoomClassSchema) {}
