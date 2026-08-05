import { listPersonalDocumentsQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListPersonalDocumentsQueryDto extends createZodDto(listPersonalDocumentsQuerySchema) {}
