import { updateDocumentTemplateSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdateDocumentTemplateDto extends createZodDto(updateDocumentTemplateSchema) {}
