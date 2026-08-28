import { moveOrganizationUnitSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class MoveOrganizationUnitDto extends createZodDto(moveOrganizationUnitSchema) {}
