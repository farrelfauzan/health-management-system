import { rescheduleDeliverySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class RescheduleDeliveryDto extends createZodDto(rescheduleDeliverySchema) {}
