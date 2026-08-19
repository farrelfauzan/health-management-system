import { updateRoleSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdateRoleDto extends createZodDto(updateRoleSchema) {}
