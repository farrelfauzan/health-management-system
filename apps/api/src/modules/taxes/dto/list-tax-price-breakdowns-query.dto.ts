import { listTaxPriceBreakdownsQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListTaxPriceBreakdownsQueryDto extends createZodDto(
  listTaxPriceBreakdownsQuerySchema,
) {}
