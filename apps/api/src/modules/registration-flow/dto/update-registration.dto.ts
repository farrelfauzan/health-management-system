import { updateRegistrationSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdateRegistrationDto extends createZodDto(updateRegistrationSchema) {}
