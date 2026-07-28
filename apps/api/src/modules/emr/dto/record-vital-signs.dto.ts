import { recordVitalSignsSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class RecordVitalSignsDto extends createZodDto(recordVitalSignsSchema) {}
