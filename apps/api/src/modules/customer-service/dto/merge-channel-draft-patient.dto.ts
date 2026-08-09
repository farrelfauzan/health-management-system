import { mergeChannelDraftPatientSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class MergeChannelDraftPatientDto extends createZodDto(mergeChannelDraftPatientSchema) {}
