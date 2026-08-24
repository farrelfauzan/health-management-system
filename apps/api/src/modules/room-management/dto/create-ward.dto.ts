import { createWardSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CreateWardDto extends createZodDto(createWardSchema) {}
