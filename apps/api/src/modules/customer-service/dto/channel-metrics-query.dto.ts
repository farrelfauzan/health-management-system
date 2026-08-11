import { channelMetricsQuerySchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

export class ChannelMetricsQueryDto extends createZodDto(channelMetricsQuerySchema) {}
