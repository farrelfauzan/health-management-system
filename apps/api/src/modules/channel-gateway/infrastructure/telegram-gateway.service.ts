import { SendChannelTextRequest } from './channel-gateway.types';

/**
 * Provider-neutral contract for talking *to* Telegram.
 *
 * An abstract class rather than an interface so Nest can use it as an
 * injection token, matching `ObjectStorageService` and `EmbeddingService`.
 * Feature code depends on this; only the adapter behind it knows grammY
 * exists, which is what keeps the Bot API's surface from leaking into the
 * dispatcher and, later, the conversation service.
 */
export abstract class TelegramGatewayService {
  /**
   * Sends one text message to a chat.
   *
   * Resolves on delivery to Telegram — not on the customer reading it, which
   * no Bot API method reports. Throws on a failure the caller should know
   * about; the dispatcher decides what a failed send means for a
   * conversation.
   */
  abstract sendText(request: SendChannelTextRequest): Promise<void>;
}
