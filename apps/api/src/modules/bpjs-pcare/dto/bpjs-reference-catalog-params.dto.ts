import { bpjsReferenceCatalogParamsSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class BpjsReferenceCatalogParamsDto extends createZodDto(bpjsReferenceCatalogParamsSchema) {}
