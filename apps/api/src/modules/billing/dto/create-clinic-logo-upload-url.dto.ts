import { createClinicLogoUploadUrlSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CreateClinicLogoUploadUrlDto extends createZodDto(createClinicLogoUploadUrlSchema) {}
