import { updateWardSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdateWardDto extends createZodDto(updateWardSchema) {}
