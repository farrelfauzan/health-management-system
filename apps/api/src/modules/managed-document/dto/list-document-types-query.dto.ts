import { listDocumentTypesQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListDocumentTypesQueryDto extends createZodDto(listDocumentTypesQuerySchema) {}
