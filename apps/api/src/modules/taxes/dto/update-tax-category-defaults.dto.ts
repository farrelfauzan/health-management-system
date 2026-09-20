import { updateTaxCategoryDefaultsSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdateTaxCategoryDefaultsDto extends createZodDto(updateTaxCategoryDefaultsSchema) {}
