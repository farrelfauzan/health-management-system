import { Injectable } from '@nestjs/common';

import {
  DeliveryGateChannelLinkRecord,
  DeliveryGatePatientRecord,
  DeliveryRefusalReasonValue,
  WhatsappDeliveryGateResult,
} from '@hms/shared-types';

import { normalizePhoneNumber } from '../../customer-service/service/normalize-phone-number';
import { DeliveryGateRepository } from '../repository/delivery-gate.repository';

/**
 * The verified-number gate (`P16-T24`, FR-E4-03).
 *
 * **Verification state, not the presence of a number, is the gate.** The
 * patient row has a phone number typed at the counter; that proves the clerk
 * heard a number, not that the patient holds it. A `ChannelPatientLink` in a
 * verified state is the possession proof (§5.1.1), and the send goes to the
 * link — the JID that answered the challenge — never to the typed number.
 *
 * Three refusals rather than one, because the send surface offers a
 * different next step for each: no link at all means "start the OTP flow";
 * an unverified link means the flow was started and not finished; and a link
 * verified for *another* patient means the number belongs to someone else —
 * a shared family phone, or a mistyped digit at the counter — and the send
 * must not happen, whatever the clerk believes.
 */
@Injectable()
export class DeliveryChannelGateService {
  constructor(private readonly gateRepository: DeliveryGateRepository) {}

  async resolveWhatsappGate(
    patient: DeliveryGatePatientRecord,
  ): Promise<WhatsappDeliveryGateResult> {
    const links = await this.gateRepository.findWhatsappLinksForPatient({
      patientId: patient.id,
      normalizedPhoneNumber: normalizePhoneNumber(patient.phoneNumber),
    });
    const ownVerifiedLink = links.find((link) => link.isVerified && link.patientId === patient.id);
    if (ownVerifiedLink !== undefined) {
      return { isAllowed: true, refusalReason: null, link: ownVerifiedLink };
    }
    return { isAllowed: false, refusalReason: resolveRefusal(links, patient.id), link: null };
  }

  resolveEmailGate(patient: DeliveryGatePatientRecord): DeliveryRefusalReasonValue | null {
    return patient.email === null || patient.email.trim() === '' ? 'EMAIL_MISSING' : null;
  }
}

/**
 * Which of the three refusals applies, most specific first. A number proven
 * for somebody else outranks an unverified claim on the same number: the
 * former is a fact about who holds the phone, the latter only about a flow
 * that has not finished.
 */
function resolveRefusal(
  links: readonly DeliveryGateChannelLinkRecord[],
  patientId: string,
): DeliveryRefusalReasonValue {
  if (links.some((link) => link.isVerified && link.patientId !== patientId)) {
    return 'NUMBER_VERIFIED_FOR_ANOTHER_PATIENT';
  }
  return links.length > 0 ? 'NUMBER_UNVERIFIED' : 'NUMBER_NOT_LINKED';
}
