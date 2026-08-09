import { whatsappWebhookEventSchema } from '@hms/shared-types';
import { createZodDto } from 'nestjs-zod';

/**
 * One inbound WhatsApp webhook body, from whichever bridge is configured.
 *
 * A union of GOWA's and WAHA's shapes rather than a DTO per bridge, so the
 * webhook URL an operator registers in the container does not change when the
 * bridge does (`PCS-T10`). The normalizer picks the reading by
 * `WA_GATEWAY_KIND`; this only has to let both bodies through the pipe.
 */
export class WhatsappWebhookEventDto extends createZodDto(whatsappWebhookEventSchema) {}
