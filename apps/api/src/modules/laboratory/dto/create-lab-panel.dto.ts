import { createLabPanelSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CreateLabPanelDto extends createZodDto(createLabPanelSchema) {}
