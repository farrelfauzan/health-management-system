import { submitClinicDocumentsForApprovalSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class SubmitClinicDocumentsForApprovalDto extends createZodDto(
  submitClinicDocumentsForApprovalSchema,
) {}
