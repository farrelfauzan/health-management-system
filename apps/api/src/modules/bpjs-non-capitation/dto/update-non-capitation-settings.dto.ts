import { updateNonCapitationSettingsSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdateNonCapitationSettingsDto extends createZodDto(
  updateNonCapitationSettingsSchema,
) {}
