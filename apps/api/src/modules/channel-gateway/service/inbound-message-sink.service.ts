import { InboundChannelMessage } from '@hms/shared-types';

/**
 * Where a normalized, deduplicated inbound message goes next.
 *
 * This is the seam between the gateway and everything that thinks. §4.1 says
 * `channel-gateway` contains **zero business logic**, and a port is how that
 * survives contact with `PCS-T06`: the conversation service will implement
 * this and be bound in place of the default, and the webhook controller will
 * not change by a line. Without it, "hand the message to the conversation
 * service" would put a dependency on the state machine inside the edge.
 *
 * An abstract class rather than an interface so Nest can use it as an
 * injection token, matching `ObjectStorageService` and `EmbeddingService`.
 */
export abstract class InboundMessageSink {
  abstract handleInboundMessage(message: InboundChannelMessage): Promise<void>;
}
