import { listDoctorSessionsQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListDoctorSessionsQueryDto extends createZodDto(listDoctorSessionsQuerySchema) {}
