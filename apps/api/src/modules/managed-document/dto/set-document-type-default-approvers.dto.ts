import { setDocumentTypeDefaultApproversSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class SetDocumentTypeDefaultApproversDto extends createZodDto(
  setDocumentTypeDefaultApproversSchema,
) {}
