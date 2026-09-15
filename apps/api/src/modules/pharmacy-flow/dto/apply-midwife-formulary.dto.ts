import { applyMidwifeFormularySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ApplyMidwifeFormularyDto extends createZodDto(applyMidwifeFormularySchema) {}
