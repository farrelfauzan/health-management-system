import { updatePersonalDocumentSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdatePersonalDocumentDto extends createZodDto(updatePersonalDocumentSchema) {}
