import { cancelAppointmentSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CancelAppointmentDto extends createZodDto(cancelAppointmentSchema) {}
