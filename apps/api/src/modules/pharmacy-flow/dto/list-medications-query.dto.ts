import { listMedicationsQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListMedicationsQueryDto extends createZodDto(listMedicationsQuerySchema) {}
