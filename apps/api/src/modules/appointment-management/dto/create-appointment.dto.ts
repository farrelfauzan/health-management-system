import { createAppointmentDocSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CreateAppointmentDto extends createZodDto(createAppointmentDocSchema) {}
