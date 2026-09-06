import { addImmunizationSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class AddImmunizationDto extends createZodDto(addImmunizationSchema) {}
