import { recordFamilyPlanningServiceSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class RecordFamilyPlanningServiceDto extends createZodDto(recordFamilyPlanningServiceSchema) {}
