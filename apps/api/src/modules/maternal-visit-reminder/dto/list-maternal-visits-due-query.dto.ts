import { listMaternalVisitsDueQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListMaternalVisitsDueQueryDto extends createZodDto(listMaternalVisitsDueQuerySchema) {}
