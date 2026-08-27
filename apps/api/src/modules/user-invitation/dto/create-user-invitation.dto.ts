import { createUserInvitationSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CreateUserInvitationDto extends createZodDto(createUserInvitationSchema) {}
