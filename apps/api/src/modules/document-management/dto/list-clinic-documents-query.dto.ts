import { listClinicDocumentsQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListClinicDocumentsQueryDto extends createZodDto(listClinicDocumentsQuerySchema) {}
