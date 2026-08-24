import { roomOccupancyQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class RoomOccupancyQueryDto extends createZodDto(roomOccupancyQuerySchema) {}
