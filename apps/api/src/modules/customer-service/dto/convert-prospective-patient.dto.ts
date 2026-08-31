import { convertProspectivePatientSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

/**
 * Deliberately the patient-create payload itself (`P17-T04`): a conversion
 * produces an ordinary registry record, so it answers to the ordinary create's
 * required demographics, identifier validation, and privacy-notice evidence.
 */
export class ConvertProspectivePatientDto extends createZodDto(convertProspectivePatientSchema) {}
