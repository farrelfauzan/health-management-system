import { SendChannelTextRequest } from './channel-gateway.types';

/**
 * Provider-neutral contract for talking *to* WhatsApp.
 *
 * **Declared now, implemented at `PCS-T09`.** It exists ahead of its adapter
 * because D-CS-01 rests on it: GOWA is the pragmatic v1, WAHA is the tested
 * fallback (`PCS-T10`), and the official Cloud API is the endgame — three
 * implementations of one port, chosen by configuration. A port introduced
 * only once its second implementation arrives is a port shaped around its
 * first, and the whole hedge against a WhatsApp ban is that swapping the
 * gateway is an adapter change rather than a redesign.
 *
 * Kept deliberately minimal for the same reason. `sendText` is what v1's
 * reply-only behaviour needs; typing indicators and read receipts are listed
 * in §4.1 and are not added until something calls them, because a port is
 * only as portable as its narrowest member.
 */
export abstract class WhatsappGatewayService {
  abstract sendText(request: SendChannelTextRequest): Promise<void>;
}
