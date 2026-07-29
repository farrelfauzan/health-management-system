import { updateBpjsDphoMappingSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdateBpjsDphoMappingDto extends createZodDto(updateBpjsDphoMappingSchema) {}
