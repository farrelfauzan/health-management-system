import { listAppointmentsQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListAppointmentsQueryDto extends createZodDto(listAppointmentsQuerySchema) {}
