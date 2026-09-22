import { upsertVisitReminderConsentSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpsertVisitReminderConsentDto extends createZodDto(upsertVisitReminderConsentSchema) {}
