import { confirmPersonalDocumentUploadSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ConfirmPersonalDocumentUploadDto extends createZodDto(
  confirmPersonalDocumentUploadSchema,
) {}
