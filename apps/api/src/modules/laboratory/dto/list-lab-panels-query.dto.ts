import { listLabPanelsQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListLabPanelsQueryDto extends createZodDto(listLabPanelsQuerySchema) {}
