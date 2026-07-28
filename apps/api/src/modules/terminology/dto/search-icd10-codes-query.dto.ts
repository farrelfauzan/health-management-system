import { searchIcd10CodesQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class SearchIcd10CodesQueryDto extends createZodDto(searchIcd10CodesQuerySchema) {}
