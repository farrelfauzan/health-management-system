import { dismissAntenatalReferralSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class DismissAntenatalReferralDto extends createZodDto(dismissAntenatalReferralSchema) {}
