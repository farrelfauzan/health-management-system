import { unassignRoleSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UnassignRoleDto extends createZodDto(unassignRoleSchema) {}
