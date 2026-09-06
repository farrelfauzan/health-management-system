import { importDocumentTemplateSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ImportDocumentTemplateDto extends createZodDto(importDocumentTemplateSchema) {}
