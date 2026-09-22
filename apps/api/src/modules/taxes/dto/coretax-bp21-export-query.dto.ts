import { coretaxBp21ExportQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CoretaxBp21ExportQueryDto extends createZodDto(coretaxBp21ExportQuerySchema) {}
