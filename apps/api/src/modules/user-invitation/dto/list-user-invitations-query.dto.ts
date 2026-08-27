import { listUserInvitationsQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListUserInvitationsQueryDto extends createZodDto(listUserInvitationsQuerySchema) {}
