import { createAdminUserSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CreateAdminUserDto extends createZodDto(createAdminUserSchema) {}
