import { listPatientDocumentsQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListPatientDocumentsQueryDto extends createZodDto(listPatientDocumentsQuerySchema) {}
