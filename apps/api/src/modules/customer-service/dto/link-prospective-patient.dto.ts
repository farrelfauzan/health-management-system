import { linkProspectivePatientSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class LinkProspectivePatientDto extends createZodDto(linkProspectivePatientSchema) {}
