import { updateAppointmentSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdateAppointmentDto extends createZodDto(updateAppointmentSchema) {}
