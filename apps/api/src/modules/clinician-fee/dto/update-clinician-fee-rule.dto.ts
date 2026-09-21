import { updateClinicianFeeRuleSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdateClinicianFeeRuleDto extends createZodDto(updateClinicianFeeRuleSchema) {}
