import { gowaWebhookEventSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class GowaWebhookEventDto extends createZodDto(gowaWebhookEventSchema) {}
