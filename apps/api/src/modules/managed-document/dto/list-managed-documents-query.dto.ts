import { listManagedDocumentsQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListManagedDocumentsQueryDto extends createZodDto(listManagedDocumentsQuerySchema) {}
