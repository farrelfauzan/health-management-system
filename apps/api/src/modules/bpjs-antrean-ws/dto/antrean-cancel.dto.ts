import { antreanCancelRequestSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class AntreanCancelDto extends createZodDto(antreanCancelRequestSchema) {}
