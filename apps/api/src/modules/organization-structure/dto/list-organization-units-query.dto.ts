import { listOrganizationUnitsQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListOrganizationUnitsQueryDto extends createZodDto(
  listOrganizationUnitsQuerySchema,
) {}
