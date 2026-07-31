import { createAiProviderConfigSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CreateAiProviderConfigDto extends createZodDto(createAiProviderConfigSchema) {}
