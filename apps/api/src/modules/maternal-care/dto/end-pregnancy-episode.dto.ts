import { endPregnancyEpisodeSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class EndPregnancyEpisodeDto extends createZodDto(endPregnancyEpisodeSchema) {}
