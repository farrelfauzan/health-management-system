import { listRegistrationsQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListRegistrationsQueryDto extends createZodDto(listRegistrationsQuerySchema) {}
