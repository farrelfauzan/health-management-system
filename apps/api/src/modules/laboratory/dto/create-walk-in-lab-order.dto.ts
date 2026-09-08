import { createWalkInLabOrderSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CreateWalkInLabOrderDto extends createZodDto(createWalkInLabOrderSchema) {}
