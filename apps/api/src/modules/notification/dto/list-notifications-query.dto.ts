import { listNotificationsQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListNotificationsQueryDto extends createZodDto(listNotificationsQuerySchema) {}
