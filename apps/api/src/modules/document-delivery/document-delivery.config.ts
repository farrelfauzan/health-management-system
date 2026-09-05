import { ConfigService } from '@nestjs/config';

import {
  DEFAULT_DELIVERY_PASSWORD_SOURCE,
  DELIVERY_PASSWORD_SOURCES,
  DocumentDeliveryConfig,
  deliveryPasswordSourceSchema,
} from '@hms/shared-types';

/**
 * Resolves delivery configuration from the environment at boot (`P16-T37`).
 *
 * `DELIVERY_PDF_PASSWORD_SOURCE` picks how an attachment's password is
 * derived (FR-E4-06). Unset means the date-of-birth default; a value outside
 * the known schemes is a boot error rather than a per-send surprise, because
 * a clinic that set it wrong would otherwise ship documents no patient can
 * open — with the message telling them the wrong thing to type.
 */
export function resolveDocumentDeliveryConfig(
  configService: ConfigService,
): DocumentDeliveryConfig {
  const rawSource = configService.get<string>('DELIVERY_PDF_PASSWORD_SOURCE');
  if (rawSource === undefined || rawSource.trim() === '') {
    return { passwordSource: DEFAULT_DELIVERY_PASSWORD_SOURCE };
  }
  const parsed = deliveryPasswordSourceSchema.safeParse(rawSource.trim());
  if (!parsed.success) {
    throw new Error(
      `Document delivery configuration error: DELIVERY_PDF_PASSWORD_SOURCE must be one of ${DELIVERY_PASSWORD_SOURCES.join(', ')}`,
    );
  }
  return { passwordSource: parsed.data };
}
