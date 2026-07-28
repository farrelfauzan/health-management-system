import { listInvoicesQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListInvoicesQueryDto extends createZodDto(listInvoicesQuerySchema) {}
