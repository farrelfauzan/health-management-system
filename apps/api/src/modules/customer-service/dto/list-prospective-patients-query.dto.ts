import { listProspectivePatientsQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListProspectivePatientsQueryDto extends createZodDto(
  listProspectivePatientsQuerySchema,
) {}
