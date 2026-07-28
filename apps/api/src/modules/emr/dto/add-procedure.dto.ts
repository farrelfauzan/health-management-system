import { addProcedureSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class AddProcedureDto extends createZodDto(addProcedureSchema) {}
