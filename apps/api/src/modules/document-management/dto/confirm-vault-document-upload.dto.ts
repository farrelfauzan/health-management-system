import { confirmVaultDocumentUploadSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ConfirmVaultDocumentUploadDto extends createZodDto(confirmVaultDocumentUploadSchema) {}
