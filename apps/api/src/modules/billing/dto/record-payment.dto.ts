import { recordPaymentSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class RecordPaymentDto extends createZodDto(recordPaymentSchema) {}
