import { assignRoleSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class AssignRoleDto extends createZodDto(assignRoleSchema) {}
