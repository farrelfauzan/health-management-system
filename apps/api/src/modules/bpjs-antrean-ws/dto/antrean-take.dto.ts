import { antreanTakeRequestSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class AntreanTakeDto extends createZodDto(antreanTakeRequestSchema) {}
