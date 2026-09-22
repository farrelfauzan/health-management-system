import { coretaxFakturExportQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CoretaxFakturExportQueryDto extends createZodDto(coretaxFakturExportQuerySchema) {}
