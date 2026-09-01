import { confirmPatientDocumentUploadSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ConfirmPatientDocumentUploadDto extends createZodDto(
  confirmPatientDocumentUploadSchema,
) {}
