import { createDocumentTypeSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CreateDocumentTypeDto extends createZodDto(createDocumentTypeSchema) {}
