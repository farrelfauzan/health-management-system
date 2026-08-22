import { dischargeAdmissionSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class DischargeAdmissionDto extends createZodDto(dischargeAdmissionSchema) {}
