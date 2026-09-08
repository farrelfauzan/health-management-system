import { listPatientLabResultsQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListPatientLabResultsQueryDto extends createZodDto(
  listPatientLabResultsQuerySchema,
) {}
