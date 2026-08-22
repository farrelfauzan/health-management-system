import { updateAdmissionSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdateAdmissionDto extends createZodDto(updateAdmissionSchema) {}
