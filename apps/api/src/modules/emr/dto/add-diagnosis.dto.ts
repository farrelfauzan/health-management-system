import { addDiagnosisSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class AddDiagnosisDto extends createZodDto(addDiagnosisSchema) {}
