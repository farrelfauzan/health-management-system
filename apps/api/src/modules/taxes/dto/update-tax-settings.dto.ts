import { updateTaxSettingsSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdateTaxSettingsDto extends createZodDto(updateTaxSettingsSchema) {}
