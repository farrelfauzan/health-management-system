import { updateAiProviderConfigSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdateAiProviderConfigDto extends createZodDto(updateAiProviderConfigSchema) {}
