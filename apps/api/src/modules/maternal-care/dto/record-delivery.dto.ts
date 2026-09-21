import { recordDeliverySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class RecordDeliveryDto extends createZodDto(recordDeliverySchema) {}
