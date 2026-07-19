import { createRegistrationSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CreateRegistrationDto extends createZodDto(createRegistrationSchema) {}
