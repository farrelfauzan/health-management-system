import { SendChannelDocumentRequest, SendChannelTextRequest } from './channel-gateway.types';

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
 * **Two members, and the admission test for a third.** `sendText` is what
 * v1's reply-only behaviour needs. `sendDocument` arrived at `P16-T22` when
 * E4 delivery became the first thing to call it — invoices and released
 * clinical files go out as WhatsApp document messages. A member is added here
 * only when something calls it *and* the official Cloud API can satisfy it:
 * the Cloud API sends document messages natively, so this one passes. Typing
 * indicators and read receipts are listed in §4.1 and are not added until
 * something calls them, because a port is only as portable as its narrowest
 * member — and a member the endgame implementation cannot honour would break
 * the hedge this port exists to keep.
 *
 * Session health and QR pairing deliberately live on a *separate* port
 * ({@link WhatsappSessionService}) rather than here. They are properties of a
 * self-hosted bridge holding a paired device — the official Cloud API has no
 * QR code and no session to lose — so putting them on this port would make
 * the endgame implementation the one that cannot satisfy it.
 */
export abstract class WhatsappGatewayService {
  abstract sendText(request: SendChannelTextRequest): Promise<void>;
  /**
   * Sends one file as a document message.
   *
   * Resolves only once the bridge has accepted the send; a rejection is the
   * signal the delivery worker (`P16-T26`) relies on to keep its row
   * `QUEUED` and retry, so a false success is never reported.
   */
  abstract sendDocument(request: SendChannelDocumentRequest): Promise<void>;
}
