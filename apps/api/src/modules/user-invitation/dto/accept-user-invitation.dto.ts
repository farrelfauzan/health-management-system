import { acceptUserInvitationSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class AcceptUserInvitationDto extends createZodDto(acceptUserInvitationSchema) {}
