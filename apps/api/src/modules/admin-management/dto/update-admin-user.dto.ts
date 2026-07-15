import { updateAdminUserSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdateAdminUserDto extends createZodDto(updateAdminUserSchema) {}
