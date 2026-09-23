import { cancelAppointmentSessionSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CancelAppointmentSessionDto extends createZodDto(cancelAppointmentSessionSchema) {}
