import { createPregnancyEpisodeSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CreatePregnancyEpisodeDto extends createZodDto(createPregnancyEpisodeSchema) {}
