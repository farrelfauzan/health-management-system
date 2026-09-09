import { releaseLabOrderSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ReleaseLabOrderDto extends createZodDto(releaseLabOrderSchema) {}
