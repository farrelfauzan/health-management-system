import { searchKfaProductsQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class SearchKfaProductsQueryDto extends createZodDto(searchKfaProductsQuerySchema) {}
