import { listChannelArrivalsQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListChannelArrivalsQueryDto extends createZodDto(listChannelArrivalsQuerySchema) {}
