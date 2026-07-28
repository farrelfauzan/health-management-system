import { openEncounterSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class OpenEncounterDto extends createZodDto(openEncounterSchema) {}
