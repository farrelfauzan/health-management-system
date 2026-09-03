import { updateVaultDocumentSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdateVaultDocumentDto extends createZodDto(updateVaultDocumentSchema) {}
