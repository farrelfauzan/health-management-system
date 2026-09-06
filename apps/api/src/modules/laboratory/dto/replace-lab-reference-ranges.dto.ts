import { replaceLabReferenceRangesSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ReplaceLabReferenceRangesDto extends createZodDto(replaceLabReferenceRangesSchema) {}
