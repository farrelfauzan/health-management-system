import { createZodDto } from 'nestjs-zod';

import { updateChatPreferencesSchema } from '@hms/shared-types';

export class UpdateChatPreferencesDto extends createZodDto(updateChatPreferencesSchema) {}
