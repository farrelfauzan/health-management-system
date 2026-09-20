import { registerNewbornSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class RegisterNewbornDto extends createZodDto(registerNewbornSchema) {}
