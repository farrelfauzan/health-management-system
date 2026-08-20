import { updateFeatureEntitlementSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdateFeatureEntitlementDto extends createZodDto(updateFeatureEntitlementSchema) {}
