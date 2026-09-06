import { rejectDocumentApprovalSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class RejectDocumentApprovalDto extends createZodDto(rejectDocumentApprovalSchema) {}
