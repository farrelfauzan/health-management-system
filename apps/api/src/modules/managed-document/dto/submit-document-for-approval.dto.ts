import { submitDocumentForApprovalSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class SubmitDocumentForApprovalDto extends createZodDto(submitDocumentForApprovalSchema) {}
