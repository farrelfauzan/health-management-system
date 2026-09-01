import { listTemplateVariablesQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ListTemplateVariablesQueryDto extends createZodDto(listTemplateVariablesQuerySchema) {}
