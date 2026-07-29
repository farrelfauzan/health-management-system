import { upsertBpjsReferralSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpsertBpjsReferralDto extends createZodDto(upsertBpjsReferralSchema) {}
