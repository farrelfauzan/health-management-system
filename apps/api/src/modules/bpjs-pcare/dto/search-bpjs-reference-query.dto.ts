import { searchBpjsReferenceQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class SearchBpjsReferenceQueryDto extends createZodDto(searchBpjsReferenceQuerySchema) {}
