import { searchIcd9cmCodesQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class SearchIcd9cmCodesQueryDto extends createZodDto(searchIcd9cmCodesQuerySchema) {}
