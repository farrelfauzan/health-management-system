import { updateServiceTariffSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdateServiceTariffDto extends createZodDto(updateServiceTariffSchema) {}
