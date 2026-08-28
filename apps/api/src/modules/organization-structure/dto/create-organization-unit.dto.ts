import { createOrganizationUnitSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CreateOrganizationUnitDto extends createZodDto(createOrganizationUnitSchema) {}
