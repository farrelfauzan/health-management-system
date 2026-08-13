import { createZodDto } from 'nestjs-zod';
import { mfaChallengeSchema } from '@hms/shared-types';

export class MfaChallengeDto extends createZodDto(mfaChallengeSchema) {}
