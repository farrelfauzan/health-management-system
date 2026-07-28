import { listSatusehatSubmissionsQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListSatusehatSubmissionsQueryDto extends createZodDto(
  listSatusehatSubmissionsQuerySchema,
) {}
