import { updatePregnancyEpisodeSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class UpdatePregnancyEpisodeDto extends createZodDto(updatePregnancyEpisodeSchema) {}
