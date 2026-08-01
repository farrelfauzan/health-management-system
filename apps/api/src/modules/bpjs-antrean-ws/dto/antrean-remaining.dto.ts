import { antreanRemainingRequestSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class AntreanRemainingDto extends createZodDto(antreanRemainingRequestSchema) {}
