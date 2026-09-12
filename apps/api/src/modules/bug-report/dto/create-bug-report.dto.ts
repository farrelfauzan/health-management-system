import { bugReportShapeSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

/**
 * Shape only. The sensitive-data rules deliberately are not here: the global
 * pipe would report them as a generic `BAD_REQUEST`, and the service raises
 * `SENSITIVE_DATA_DETECTED` with the field and category instead.
 */
export class CreateBugReportDto extends createZodDto(bugReportShapeSchema) {}
