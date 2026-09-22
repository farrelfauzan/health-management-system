import { nonCapitationRecapQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class NonCapitationRecapQueryDto extends createZodDto(nonCapitationRecapQuerySchema) {}
