import { linkDoctorByIhsSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class LinkDoctorByIhsDto extends createZodDto(linkDoctorByIhsSchema) {}
