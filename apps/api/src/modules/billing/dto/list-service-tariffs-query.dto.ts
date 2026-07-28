import { listServiceTariffsQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListServiceTariffsQueryDto extends createZodDto(listServiceTariffsQuerySchema) {}
