import { updateManagedDocumentSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdateManagedDocumentDto extends createZodDto(updateManagedDocumentSchema) {}
