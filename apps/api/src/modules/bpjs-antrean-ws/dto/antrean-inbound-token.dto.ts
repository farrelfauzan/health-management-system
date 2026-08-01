import { antreanInboundTokenRequestSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class AntreanInboundTokenDto extends createZodDto(antreanInboundTokenRequestSchema) {}
