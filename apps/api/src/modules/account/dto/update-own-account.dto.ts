import { updateOwnAccountSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdateOwnAccountDto extends createZodDto(updateOwnAccountSchema) {}
