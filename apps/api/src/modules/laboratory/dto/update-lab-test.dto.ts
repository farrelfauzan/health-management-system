import { updateLabTestSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdateLabTestDto extends createZodDto(updateLabTestSchema) {}
