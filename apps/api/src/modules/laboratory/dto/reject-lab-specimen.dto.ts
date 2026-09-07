import { rejectLabSpecimenSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class RejectLabSpecimenDto extends createZodDto(rejectLabSpecimenSchema) {}
