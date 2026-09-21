import { startFamilyPlanningSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class StartFamilyPlanningDto extends createZodDto(startFamilyPlanningSchema) {}
