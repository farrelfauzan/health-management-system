import { updateEncounterSoapSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdateEncounterSoapDto extends createZodDto(updateEncounterSoapSchema) {}
