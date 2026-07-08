import { createZodDto } from 'nestjs-zod';
import { refreshTokenSchema } from '@hms/shared-types';

export class RefreshTokenDto extends createZodDto(refreshTokenSchema) {}
