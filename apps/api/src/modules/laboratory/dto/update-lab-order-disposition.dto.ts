import { clinicalRequestDispositionSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdateLabOrderDispositionDto extends createZodDto(clinicalRequestDispositionSchema) {}
