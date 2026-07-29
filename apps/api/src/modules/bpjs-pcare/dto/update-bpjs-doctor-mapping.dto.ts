import { updateBpjsDoctorMappingSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdateBpjsDoctorMappingDto extends createZodDto(updateBpjsDoctorMappingSchema) {}
