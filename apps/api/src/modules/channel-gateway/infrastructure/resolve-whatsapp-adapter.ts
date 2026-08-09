import { ConfigService } from '@nestjs/config';

import { resolveChannelGatewayConfig } from '../channel-gateway.config';
import { GowaWhatsappAdapter } from './gowa-whatsapp.adapter';
import { WahaWhatsappAdapter } from './waha-whatsapp.adapter';

/**
 * Both bridge adapters implement both WhatsApp ports, so one object satisfies
 * the messaging and the session binding alike.
 */
export type WhatsappAdapter = GowaWhatsappAdapter | WahaWhatsappAdapter;

/**
 * Picks the WhatsApp bridge from `WA_GATEWAY_KIND` (`PCS-T10`, D-CS-01).
 *
 * **This function is the whole of the switch.** D-CS-01's claim is that if
 * GOWA breaks on a WhatsApp update, moving to WAHA is configuration rather
 * than a redesign — and the way to keep that claim honest is for the choice to
 * exist in exactly one place, be made once at startup, and be provable by a
 * test that reads the resolved instance rather than by inspection.
 *
 * Both adapters are constructed rather than only the selected one, which costs
 * nothing — neither opens a connection in its constructor — and buys something
 * worth having: the unselected adapter is still instantiated on every boot, so
 * a change that breaks its construction fails immediately instead of on the
 * day of a failover, which is the worst possible day to discover it.
 */
export function resolveWhatsappAdapter(
  configService: ConfigService,
  gowaAdapter: GowaWhatsappAdapter,
  wahaAdapter: WahaWhatsappAdapter,
): WhatsappAdapter {
  const { kind } = resolveChannelGatewayConfig(configService).whatsapp;
  // GOWA is the default rather than the fallback of an exhaustive switch: an
  // unrecognised value is already normalised to `GOWA` by the config resolver,
  // and D-CS-01 names it as the primary.
  return kind === 'WAHA' ? wahaAdapter : gowaAdapter;
}
