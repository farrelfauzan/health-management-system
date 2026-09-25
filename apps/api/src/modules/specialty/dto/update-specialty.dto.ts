import { updateSpecialtySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdateSpecialtyDto extends createZodDto(updateSpecialtySchema) {}
