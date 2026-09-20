import { updateTaxCodeSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdateTaxCodeDto extends createZodDto(updateTaxCodeSchema) {}
