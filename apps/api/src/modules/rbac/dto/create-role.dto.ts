import { createRoleSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CreateRoleDto extends createZodDto(createRoleSchema) {}
