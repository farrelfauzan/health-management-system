import { searchBpjsReferenceRemoteSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class SearchBpjsReferenceRemoteDto extends createZodDto(searchBpjsReferenceRemoteSchema) {}
