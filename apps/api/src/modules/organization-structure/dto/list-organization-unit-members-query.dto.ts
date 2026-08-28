import { listOrganizationUnitMembersQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListOrganizationUnitMembersQueryDto extends createZodDto(
  listOrganizationUnitMembersQuerySchema,
) {}
