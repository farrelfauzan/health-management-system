import { updateClinicDocumentSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdateClinicDocumentDto extends createZodDto(updateClinicDocumentSchema) {}
