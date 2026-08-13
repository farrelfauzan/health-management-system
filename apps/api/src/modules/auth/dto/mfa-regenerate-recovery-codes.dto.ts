import { createZodDto } from 'nestjs-zod';
import { mfaRegenerateRecoveryCodesSchema } from '@hms/shared-types';

export class MfaRegenerateRecoveryCodesDto extends createZodDto(
  mfaRegenerateRecoveryCodesSchema,
) {}
