import { createTaxCodeSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CreateTaxCodeDto extends createZodDto(createTaxCodeSchema) {}
