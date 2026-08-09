import { Injectable } from '@nestjs/common';

import { WHATSAPP_USER_JID_SUFFIX } from '@hms/shared-types';

import { WhatsappGatewayService } from '../../channel-gateway/infrastructure/whatsapp-gateway.service';
import { CS_REPLY_TEMPLATES } from './cs-reply-templates';
import { OtpDeliveryService } from './otp-delivery.service';

/**
 * §5.1.1's code tier, over WhatsApp (`PCS-T09`).
 *
 * **This is the binding `PCS-T07` left unwired**, and the reason it had to
 * wait is the whole design of the tier: the code must reach the number *on the
 * patient record*, not the chat that asked for it. That asymmetry is the
 * entire proof — anyone can claim a number, and only the person holding it
 * receives what is sent to it — and Telegram, which addresses chats rather
 * than phone numbers, structurally cannot carry it. WhatsApp can, so the tier
 * turns on here by providing a class rather than by editing the booking flow.
 *
 * Two properties are worth naming because they are easy to lose:
 *
 * **The message goes to a number that may never have contacted the clinic.**
 * That is unavoidable — it is what a possession challenge is — but it makes
 * this the one outbound message on the channel that is *not* reply-only
 * (§2.1), so it is deliberately the only one, it is short, it says who is
 * asking, and §8.3's per-chat challenge quota is what stops it becoming a way
 * to make the clinic text strangers.
 *
 * **Throwing is the correct failure.** `ChannelVerificationService` consumes
 * the challenge when delivery fails and falls straight through to a draft
 * booking, which §5.1.1 already specifies. Swallowing the error would leave a
 * customer waiting five minutes for a code that was never sent.
 */
@Injectable()
export class WhatsappOtpDeliveryAdapter extends OtpDeliveryService {
  constructor(private readonly whatsappGateway: WhatsappGatewayService) {
    super();
  }

  async sendVerificationCode(params: { phoneNumber: string; code: string }): Promise<void> {
    await this.whatsappGateway.sendText({
      // The stored number is already normalised to digits (§5.1), so building
      // the JID is a suffix rather than a parse.
      externalChatId: `${params.phoneNumber}${WHATSAPP_USER_JID_SUFFIX}`,
      text: CS_REPLY_TEMPLATES.otpCodeMessage(params.code),
    });
  }
}
