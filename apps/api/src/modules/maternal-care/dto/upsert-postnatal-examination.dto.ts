import { upsertPostnatalExaminationSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpsertPostnatalExaminationDto extends createZodDto(
  upsertPostnatalExaminationSchema,
) {}
