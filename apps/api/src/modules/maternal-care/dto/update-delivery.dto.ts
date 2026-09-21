import { updateDeliverySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdateDeliveryDto extends createZodDto(updateDeliverySchema) {}
