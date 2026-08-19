import { setRolePermissionsSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class SetRolePermissionsDto extends createZodDto(setRolePermissionsSchema) {}
