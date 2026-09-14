import { registerSatusehatLocationsSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class RegisterSatusehatLocationsDto extends createZodDto(registerSatusehatLocationsSchema) {}
