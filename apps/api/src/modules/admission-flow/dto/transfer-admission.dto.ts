import { transferAdmissionSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class TransferAdmissionDto extends createZodDto(transferAdmissionSchema) {}
