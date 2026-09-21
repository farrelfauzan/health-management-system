import { clinicianFeeStatementQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ClinicianFeeStatementQueryDto extends createZodDto(clinicianFeeStatementQuerySchema) {}
