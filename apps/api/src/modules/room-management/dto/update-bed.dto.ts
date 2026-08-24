import { updateBedSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdateBedDto extends createZodDto(updateBedSchema) {}
