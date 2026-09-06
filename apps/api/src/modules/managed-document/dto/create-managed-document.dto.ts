import { createManagedDocumentSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CreateManagedDocumentDto extends createZodDto(createManagedDocumentSchema) {}
