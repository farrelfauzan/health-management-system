import { createZodDto } from 'nestjs-zod';
import { mfaResetSchema } from '@hms/shared-types';

export class MfaResetDto extends createZodDto(mfaResetSchema) {}
