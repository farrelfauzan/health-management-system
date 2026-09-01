import { createDocumentTemplateSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CreateDocumentTemplateDto extends createZodDto(createDocumentTemplateSchema) {}
