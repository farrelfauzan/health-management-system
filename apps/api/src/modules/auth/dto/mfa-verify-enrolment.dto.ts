import { createZodDto } from 'nestjs-zod';
import { mfaVerifyEnrolmentSchema } from '@hms/shared-types';

export class MfaVerifyEnrolmentDto extends createZodDto(mfaVerifyEnrolmentSchema) {}
