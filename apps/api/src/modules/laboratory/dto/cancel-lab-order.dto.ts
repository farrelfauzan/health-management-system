import { cancelLabOrderSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CancelLabOrderDto extends createZodDto(cancelLabOrderSchema) {}
