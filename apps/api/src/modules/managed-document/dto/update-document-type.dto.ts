import { updateDocumentTypeSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdateDocumentTypeDto extends createZodDto(updateDocumentTypeSchema) {}
