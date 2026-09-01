import { updatePatientDocumentSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdatePatientDocumentDto extends createZodDto(updatePatientDocumentSchema) {}
