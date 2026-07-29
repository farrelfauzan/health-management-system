import { listBpjsSubmissionsQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListBpjsSubmissionsQueryDto extends createZodDto(listBpjsSubmissionsQuerySchema) {}
