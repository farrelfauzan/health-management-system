import { discontinueFamilyPlanningSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class DiscontinueFamilyPlanningDto extends createZodDto(discontinueFamilyPlanningSchema) {}
