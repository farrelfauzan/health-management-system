import { listDoctorsQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListDoctorsQueryDto extends createZodDto(listDoctorsQuerySchema) {}
