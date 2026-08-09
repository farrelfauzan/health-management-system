import { WhatsappPairingSessionView, WhatsappSessionHealth } from '@hms/shared-types';

/**
 * Provider-neutral contract for the *operational* half of a self-hosted
 * WhatsApp bridge (`PCS-T10`, §8.4).
 *
 * Separate from {@link WhatsappGatewayService}, and the split is along a real
 * boundary rather than a tidiness one. Sending a message is something all
 * three planned implementations do — GOWA, WAHA, and eventually the official
 * Cloud API. Holding a paired device that can silently log out, and recovering
 * it by showing a QR code, is something only the two *self-hosted bridges* do:
 * the Cloud API authenticates with a permanent token and has no session to
 * lose. Folding these two methods into the messaging port would have made the
 * endgame implementation the one that could not satisfy it.
 *
 * `PCS-T09` put them on the concrete GOWA class for want of a second
 * implementation. `PCS-T10` is that second implementation, so they become a
 * port — and the admin controller stops naming a vendor.
 */
export abstract class WhatsappSessionService {
  /**
   * Whether the paired device is configured, reachable, and still logged in.
   *
   * **Never throws.** §8.4's failure mode is a session that dies silently, and
   * the screen that exists to show that must not itself fail — a status card
   * that errors looks exactly like one nobody loaded. An unreachable bridge is
   * reported as unreachable, because that *is* the alert.
   */
  abstract readSessionHealth(): Promise<WhatsappSessionHealth>;

  /**
   * Starts a QR pairing and returns a link to the code.
   *
   * Throws when the bridge cannot start one, unlike {@link readSessionHealth}:
   * this is an action somebody took, and a button that silently does nothing
   * is worse than one that reports why.
   */
  abstract startPairing(): Promise<WhatsappPairingSessionView>;
}
