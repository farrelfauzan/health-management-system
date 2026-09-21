import { linkPostnatalVisitSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class LinkPostnatalVisitDto extends createZodDto(linkPostnatalVisitSchema) {}
