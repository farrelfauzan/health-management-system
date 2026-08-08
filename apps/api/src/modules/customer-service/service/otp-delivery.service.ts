import { Injectable } from '@nestjs/common';

/**
 * Sends a verification code to a number the clinic already has on file
 * (strategy §5.1.1, tier 3).
 *
 * **Declared and unbound in this slice, exactly like `WhatsappGatewayService`
 * at `PCS-T05`.** The code has to reach the *registered* number, not the chat
 * that asked — that asymmetry is the entire proof — and Telegram cannot
 * message a phone number. The transport §5.1.1 names is the WhatsApp gateway,
 * which `PCS-T09` binds; SMS is the documented later option.
 *
 * So on the Telegram pilot this port has no provider, and the booking flow
 * treats that as "this customer cannot be challenged by code" rather than as
 * an error: Telegram's contact-share tier still works, and everything else
 * falls through to a draft booking, which is the same outcome §5.1.1 already
 * specifies for a customer who declines or fails. Nobody hits a dead end, and
 * `PCS-T09` turns the tier on by binding a provider rather than by editing
 * this flow.
 *
 * The port is deliberately given the code as a parameter rather than being
 * asked to generate one. Minting, hashing, and expiring belong to the
 * challenge, which is a thing this module owns; delivery is a wire.
 */
@Injectable()
export abstract class OtpDeliveryService {
  /**
   * Delivers `code` to `phoneNumber`. Throwing is the correct failure: the
   * caller must not tell a customer a code is on its way when it is not, and
   * must fall through to the draft path instead.
   */
  abstract sendVerificationCode(params: { phoneNumber: string; code: string }): Promise<void>;
}
