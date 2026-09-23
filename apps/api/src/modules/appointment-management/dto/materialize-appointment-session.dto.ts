import { materializeAppointmentSessionSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class MaterializeAppointmentSessionDto extends createZodDto(
  materializeAppointmentSessionSchema,
) {}
