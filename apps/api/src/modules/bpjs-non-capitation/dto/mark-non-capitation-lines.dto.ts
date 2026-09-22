import { markNonCapitationLinesSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class MarkNonCapitationLinesDto extends createZodDto(markNonCapitationLinesSchema) {}
