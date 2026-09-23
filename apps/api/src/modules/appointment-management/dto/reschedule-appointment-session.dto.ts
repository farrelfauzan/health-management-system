import { rescheduleAppointmentSessionSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class RescheduleAppointmentSessionDto extends createZodDto(
  rescheduleAppointmentSessionSchema,
) {}
