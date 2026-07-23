import { approveAppointmentSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ApproveAppointmentDto extends createZodDto(approveAppointmentSchema) {}
