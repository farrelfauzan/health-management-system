import { listUsersQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListUsersQueryDto extends createZodDto(listUsersQuerySchema) {}
