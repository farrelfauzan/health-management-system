import { cancelAdmissionSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CancelAdmissionDto extends createZodDto(cancelAdmissionSchema) {}
