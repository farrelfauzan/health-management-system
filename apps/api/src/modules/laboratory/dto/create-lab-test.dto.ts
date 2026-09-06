import { createLabTestSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CreateLabTestDto extends createZodDto(createLabTestSchema) {}
