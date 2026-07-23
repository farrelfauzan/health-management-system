import { rejectAppointmentSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class RejectAppointmentDto extends createZodDto(rejectAppointmentSchema) {}
