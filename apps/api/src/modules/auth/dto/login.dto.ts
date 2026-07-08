import { createZodDto } from 'nestjs-zod';
import { loginSchema } from '@hms/shared-types';

export class LoginDto extends createZodDto(loginSchema) {}
