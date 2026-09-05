import { Injectable } from '@nestjs/common';

import { DeliveryGateChannelLinkRecord, DeliveryGatePatientRecord } from '@hms/shared-types';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { ChannelVerificationStatus, Prisma } from '../../../generated/prisma/client';

/**
 * The two link states that count as proof of possession (FR-E4-03). The
 * ticket's `VERIFIED` is a tier, not a column value: the schema records
 * *how* the number was proven, and both proofs satisfy the gate.
 */
const VERIFIED_STATUSES: readonly ChannelVerificationStatus[] = [
  ChannelVerificationStatus.CHANNEL_VERIFIED,
  ChannelVerificationStatus.OTP_VERIFIED,
];

const LINK_SELECT = {
  id: true,
  externalChatId: true,
  phoneNumber: true,
  patientId: true,
  verificationStatus: true,
} satisfies Prisma.ChannelPatientLinkSelect;

type LinkRow = Prisma.ChannelPatientLinkGetPayload<{ select: typeof LINK_SELECT }>;

/**
 * What the delivery gate reads (`P16-T24`): the patient's contact fields and
 * the WhatsApp links that could carry a document to them.
 *
 * Read-only by design, and reading across two modules' tables on purpose:
 * the gate's question — "is this number proven to be this patient's" — is a
 * join between a patient and a channel link that neither owning module asks,
 * and a delivery module that had to route it through both services would
 * couple the send path to the booking flow it has nothing to do with.
 */
@Injectable()
export class DeliveryGateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findPatientContact(patientId: string): Promise<DeliveryGatePatientRecord | null> {
    return this.prisma.patientProfile.findFirst({
      where: { id: patientId, deletedAt: null },
      select: { id: true, phoneNumber: true, email: true },
    });
  }

  /**
   * Every WhatsApp link that either names this patient or claims their
   * number. Both are needed: a link proven for this patient may carry a
   * differently-written number, and a link claiming this number may be
   * proven for someone else — which is the refusal that gets audited.
   */
  async findWhatsappLinksForPatient(params: {
    patientId: string;
    normalizedPhoneNumber: string;
  }): Promise<DeliveryGateChannelLinkRecord[]> {
    const rows = await this.prisma.channelPatientLink.findMany({
      where: {
        channel: 'WHATSAPP',
        OR: [{ patientId: params.patientId }, { phoneNumber: params.normalizedPhoneNumber }],
      },
      orderBy: [{ verifiedAt: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }],
      select: LINK_SELECT,
    });
    return rows.map(toLinkRecord);
  }

  /** Every patient a WhatsApp chat has been proven for — the opt-out's targets. */
  async findVerifiedPatientIdsForChat(externalChatId: string): Promise<string[]> {
    const rows = await this.prisma.channelPatientLink.findMany({
      where: {
        channel: 'WHATSAPP',
        externalChatId,
        patientId: { not: null },
        verificationStatus: { in: [...VERIFIED_STATUSES] },
      },
      select: { patientId: true },
      distinct: ['patientId'],
    });
    return rows.flatMap((row) => (row.patientId === null ? [] : [row.patientId]));
  }
}

function toLinkRecord(row: LinkRow): DeliveryGateChannelLinkRecord {
  return {
    id: row.id,
    externalChatId: row.externalChatId,
    phoneNumber: row.phoneNumber,
    patientId: row.patientId,
    isVerified: VERIFIED_STATUSES.includes(row.verificationStatus),
  };
}
