import { listDoctorCredentialOptionsQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListDoctorCredentialOptionsQueryDto extends createZodDto(listDoctorCredentialOptionsQuerySchema) {}
