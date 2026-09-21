import { createClinicianFeeRuleSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CreateClinicianFeeRuleDto extends createZodDto(createClinicianFeeRuleSchema) {}
