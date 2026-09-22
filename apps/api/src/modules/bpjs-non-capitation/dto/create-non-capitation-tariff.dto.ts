import { createNonCapitationTariffSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class CreateNonCapitationTariffDto extends createZodDto(createNonCapitationTariffSchema) {}
