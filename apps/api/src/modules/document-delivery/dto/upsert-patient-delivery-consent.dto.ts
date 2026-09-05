import { upsertPatientDeliveryConsentSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpsertPatientDeliveryConsentDto extends createZodDto(
  upsertPatientDeliveryConsentSchema,
) {}
