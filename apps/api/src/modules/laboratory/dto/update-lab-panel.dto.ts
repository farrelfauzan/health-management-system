import { updateLabPanelSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdateLabPanelDto extends createZodDto(updateLabPanelSchema) {}
