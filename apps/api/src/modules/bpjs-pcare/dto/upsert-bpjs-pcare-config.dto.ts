import { upsertBpjsPcareConfigSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpsertBpjsPcareConfigDto extends createZodDto(upsertBpjsPcareConfigSchema) {}
