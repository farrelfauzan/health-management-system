import { antreanStatusRequestSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class AntreanStatusDto extends createZodDto(antreanStatusRequestSchema) {}
