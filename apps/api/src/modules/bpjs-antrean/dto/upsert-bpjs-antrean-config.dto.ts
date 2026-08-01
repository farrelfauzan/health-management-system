import { upsertBpjsAntreanConfigSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpsertBpjsAntreanConfigDto extends createZodDto(upsertBpjsAntreanConfigSchema) {}
