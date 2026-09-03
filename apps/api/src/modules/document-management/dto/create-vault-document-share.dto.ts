import { createVaultDocumentShareSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CreateVaultDocumentShareDto extends createZodDto(createVaultDocumentShareSchema) {}
