import { checkBpjsEligibilitySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CheckBpjsEligibilityDto extends createZodDto(checkBpjsEligibilitySchema) {}
