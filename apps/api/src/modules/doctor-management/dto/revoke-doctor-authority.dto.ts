import { revokeDoctorAuthoritySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class RevokeDoctorAuthorityDto extends createZodDto(revokeDoctorAuthoritySchema) {}
