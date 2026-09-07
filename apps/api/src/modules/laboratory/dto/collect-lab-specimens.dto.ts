import { collectLabSpecimensSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CollectLabSpecimensDto extends createZodDto(collectLabSpecimensSchema) {}
