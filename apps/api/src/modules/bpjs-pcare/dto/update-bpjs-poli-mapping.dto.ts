import { updateBpjsPoliMappingSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdateBpjsPoliMappingDto extends createZodDto(updateBpjsPoliMappingSchema) {}
