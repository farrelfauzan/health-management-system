import { updateDoctorScheduleSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdateDoctorScheduleDto extends createZodDto(updateDoctorScheduleSchema) {}
