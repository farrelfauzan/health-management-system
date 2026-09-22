import { kohortRegisterQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class KohortRegisterQueryDto extends createZodDto(kohortRegisterQuerySchema) {}
