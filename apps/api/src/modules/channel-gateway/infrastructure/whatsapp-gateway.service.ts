import { SendChannelTextRequest } from './channel-gateway.types';

/**
 * Provider-neutral contract for talking *to* WhatsApp.
 *
 * Declared at `PCS-T05`, implemented by GOWA at `PCS-T09` and by WAHA at
 * `PCS-T10`. D-CS-01 rests on it: GOWA is the pragmatic v1, WAHA is the
 * tested fallback, and the official Cloud API is the endgame — three
 * implementations of one port, chosen by configuration. A port introduced
 * only once its second implementation arrives is a port shaped around its
 * first, and the whole hedge against a WhatsApp ban is that swapping the
 * gateway is an adapter change rather than a redesign.
 *
 * **Still one method after two implementations**, which is the evidence the
 * shape was right. `sendText` is what v1's reply-only behaviour needs;
 * typing indicators and read receipts are listed in §4.1 and are not added
 * until something calls them, because a port is only as portable as its
 * narrowest member.
 *
 * Session health and QR pairing deliberately live on a *separate* port
 * ({@link WhatsappSessionService}) rather than here. They are properties of a
 * self-hosted bridge holding a paired device — the official Cloud API has no
 * QR code and no session to lose — so putting them on this port would make
 * the endgame implementation the one that cannot satisfy it.
 */
export abstract class WhatsappGatewayService {
  abstract sendText(request: SendChannelTextRequest): Promise<void>;
}
