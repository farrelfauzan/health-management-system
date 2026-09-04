import { Injectable, Logger } from '@nestjs/common';

import { InboundChannelMessage, isDeliveryOptOutKeyword } from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { AuditAction } from '../../../generated/prisma/client';
import { WhatsappGatewayService } from '../../channel-gateway/infrastructure/whatsapp-gateway.service';
import { InboundOptOutHandler } from '../../channel-gateway/service/inbound-opt-out-handler.service';
import { DeliveryGateRepository } from '../repository/delivery-gate.repository';
import { PatientDeliveryConsentRepository } from '../repository/patient-delivery-consent.repository';
import { DELIVERY_OPT_OUT_CONFIRMATION } from './delivery-opt-out-reply';

const CONSENT_AUDIT_RESOURCE = 'PatientDeliveryConsent';

/**
 * `STOP` / `BERHENTI` on WhatsApp revokes delivery consent (`P16-T24`,
 * FR-E4-16, US-E4-05).
 *
 * The chat is the identity here, not the number the counter typed: consent is
 * revoked for every patient this chat has been *proven* for, because those
 * are exactly the records a document could be sent to it under. A chat that
 * is proven for nobody has nothing to revoke and is still answered — the
 * person asked the clinic to stop, and the honest reply is that nothing will
 * be sent, which is already true.
 *
 * The confirmation goes out whether or not the revoke succeeded in writing
 * an audit row, but never *before* the consent row is written: a patient who
 * reads "we will stop" must already have been stopped.
 */
@Injectable()
export class DeliveryOptOutService extends InboundOptOutHandler {
  private readonly logger = new Logger(DeliveryOptOutService.name);

  constructor(
    private readonly consentRepository: PatientDeliveryConsentRepository,
    private readonly gateRepository: DeliveryGateRepository,
    private readonly whatsappGateway: WhatsappGatewayService,
    private readonly auditService: AuditService,
  ) {
    super();
  }

  async handleOptOut(message: InboundChannelMessage): Promise<boolean> {
    // Telegram carries no deliveries (PRD §7.4), so its `STOP` is just a word
    // for the conversation to deal with.
    if (message.channel !== 'WHATSAPP' || !isDeliveryOptOutKeyword(message.text)) {
      return false;
    }
    const patientIds = await this.gateRepository.findVerifiedPatientIdsForChat(
      message.externalChatId,
    );
    const revokedAt = new Date();
    for (const patientId of patientIds) {
      await this.consentRepository.revoke({
        patientId,
        channel: 'WHATSAPP',
        revokedReason: 'PATIENT_KEYWORD',
        revokedAt,
      });
      // No actor: the patient did this. No chat id either — it is a phone
      // number, and the patient id already says whose consent it was.
      await this.auditService.record({
        action: AuditAction.DELIVERY_CONSENT_OPTED_OUT,
        resource: CONSENT_AUDIT_RESOURCE,
        patientId,
        metadata: { channel: 'WHATSAPP', revokedReason: 'PATIENT_KEYWORD' },
      });
    }
    await this.sendConfirmation(message.externalChatId, patientIds.length);
    return true;
  }

  private async sendConfirmation(externalChatId: string, revokedCount: number): Promise<void> {
    try {
      await this.whatsappGateway.sendText({ externalChatId, text: DELIVERY_OPT_OUT_CONFIRMATION });
    } catch (caughtError) {
      // The consent is already revoked, which is the part that matters; a
      // confirmation that failed to send is logged, without the chat id.
      this.logger.error(
        buildSafeErrorLog('delivery_opt_out_confirmation_failed', {
          revokedCount,
          reason: caughtError instanceof Error ? caughtError.name : 'unknown',
        }),
      );
    }
  }
}
