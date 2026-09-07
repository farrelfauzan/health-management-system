import { createLabOrderSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CreateLabOrderDto extends createZodDto(createLabOrderSchema) {}
