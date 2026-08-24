import { createBedSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CreateBedDto extends createZodDto(createBedSchema) {}
