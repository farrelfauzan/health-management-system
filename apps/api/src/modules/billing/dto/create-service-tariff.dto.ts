import { createServiceTariffSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CreateServiceTariffDto extends createZodDto(createServiceTariffSchema) {}
