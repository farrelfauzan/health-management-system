import { listEligibleApproversQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListEligibleApproversQueryDto extends createZodDto(
  listEligibleApproversQuerySchema,
) {}
