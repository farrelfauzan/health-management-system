import { updateOrganizationUnitSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdateOrganizationUnitDto extends createZodDto(updateOrganizationUnitSchema) {}
