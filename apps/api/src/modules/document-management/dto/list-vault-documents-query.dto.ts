import { listVaultDocumentsQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListVaultDocumentsQueryDto extends createZodDto(listVaultDocumentsQuerySchema) {}
