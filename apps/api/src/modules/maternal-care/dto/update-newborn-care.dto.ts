import { updateNewbornCareSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdateNewbornCareDto extends createZodDto(updateNewbornCareSchema) {}
