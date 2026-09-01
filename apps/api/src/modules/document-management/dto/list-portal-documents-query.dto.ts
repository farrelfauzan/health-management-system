import { listPortalDocumentsQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListPortalDocumentsQueryDto extends createZodDto(listPortalDocumentsQuerySchema) {}
