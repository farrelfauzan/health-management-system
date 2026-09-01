import { deletePatientDocumentSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class DeletePatientDocumentDto extends createZodDto(deletePatientDocumentSchema) {}
