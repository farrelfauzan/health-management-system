import { listLabTestsQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListLabTestsQueryDto extends createZodDto(listLabTestsQuerySchema) {}
