import { listFamilyPlanningDueQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListFamilyPlanningDueQueryDto extends createZodDto(listFamilyPlanningDueQuerySchema) {}
