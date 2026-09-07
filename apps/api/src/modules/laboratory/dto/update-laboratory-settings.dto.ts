import { updateLaboratorySettingsSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdateLaboratorySettingsDto extends createZodDto(updateLaboratorySettingsSchema) {}
