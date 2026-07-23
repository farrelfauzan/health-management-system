import { updateAppointmentSessionSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdateAppointmentSessionDto extends createZodDto(updateAppointmentSessionSchema) {}
