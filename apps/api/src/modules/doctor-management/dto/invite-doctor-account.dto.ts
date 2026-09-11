import { inviteDoctorAccountSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class InviteDoctorAccountDto extends createZodDto(inviteDoctorAccountSchema) {}
