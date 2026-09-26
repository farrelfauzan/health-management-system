import { createSpecialtySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CreateSpecialtyDto extends createZodDto(createSpecialtySchema) {}
