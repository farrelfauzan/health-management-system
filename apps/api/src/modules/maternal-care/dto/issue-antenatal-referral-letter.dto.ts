import { issueAntenatalReferralLetterSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class IssueAntenatalReferralLetterDto extends createZodDto(
  issueAntenatalReferralLetterSchema,
) {}
