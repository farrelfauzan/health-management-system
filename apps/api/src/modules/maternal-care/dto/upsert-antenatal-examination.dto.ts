import { upsertAntenatalExaminationSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpsertAntenatalExaminationDto extends createZodDto(
  upsertAntenatalExaminationSchema,
) {}
