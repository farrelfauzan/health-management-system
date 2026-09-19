import { createTaxCodeRateSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CreateTaxCodeRateDto extends createZodDto(createTaxCodeRateSchema) {}
