import { createZodDto } from 'nestjs-zod';
import { logoutSchema } from '@hms/shared-types';

export class LogoutDto extends createZodDto(logoutSchema) {}
