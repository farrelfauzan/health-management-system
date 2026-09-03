import { listVaultDocumentShareRecipientsQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListVaultDocumentShareRecipientsQueryDto extends createZodDto(
  listVaultDocumentShareRecipientsQuerySchema,
) {}
