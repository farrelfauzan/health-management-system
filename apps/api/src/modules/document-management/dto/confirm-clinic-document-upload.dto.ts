import { confirmClinicDocumentUploadSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ConfirmClinicDocumentUploadDto extends createZodDto(
  confirmClinicDocumentUploadSchema,
) {}
