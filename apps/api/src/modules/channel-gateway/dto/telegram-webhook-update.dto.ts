import { telegramWebhookUpdateSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class TelegramWebhookUpdateDto extends createZodDto(telegramWebhookUpdateSchema) {}
