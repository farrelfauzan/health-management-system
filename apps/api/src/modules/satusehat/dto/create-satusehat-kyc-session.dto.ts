import { createSatusehatKycSessionSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CreateSatusehatKycSessionDto extends createZodDto(createSatusehatKycSessionSchema) {}
