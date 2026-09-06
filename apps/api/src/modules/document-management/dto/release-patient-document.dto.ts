import { releasePatientDocumentSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ReleasePatientDocumentDto extends createZodDto(releasePatientDocumentSchema) {}
