import { createDispenseSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CreateDispenseDto extends createZodDto(createDispenseSchema) {}
