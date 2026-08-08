import { Injectable } from '@nestjs/common';

import {
  ChannelKindValue,
  ChannelPatientLinkRecord,
  ChannelVerificationStatusValue,
} from '@hms/shared-types';

import { PrismaService } from '../../../common/prisma/prisma.service';

type ChannelPatientLinkRow = {
  id: string;
  channel: ChannelKindValue;
  externalChatId: string;
  phoneNumber: string;
  fullName: string;
  patientId: string | null;
  verificationStatus: ChannelVerificationStatusValue;
  verifiedAt: Date | null;
};

/**
 * The claim a chat has made about who it belongs to (strategy §5.1).
 */
@Injectable()
export class ChannelPatientLinkRepository {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Records — or refreshes — what this chat says its name and number are.
   *
   * An upsert keyed by `(channel, chat, phone)`, so a customer booking for
   * themselves and then for a relative from the same chat gets two rows rather
   * than one row that keeps being overwritten. **The verification status is
   * never touched here**: it is earned by {@link markVerified} and by nothing
   * else, so a second booking under an already-verified number cannot reset —
   * or silently inherit — a proof it did not repeat.
   */
  async recordClaim(params: {
    channel: ChannelKindValue;
    externalChatId: string;
    phoneNumber: string;
    fullName: string;
  }): Promise<ChannelPatientLinkRecord> {
    const row = await this.prismaService.channelPatientLink.upsert({
      where: {
        channel_externalChatId_phoneNumber: {
          channel: params.channel,
          externalChatId: params.externalChatId,
          phoneNumber: params.phoneNumber,
        },
      },
      create: {
        channel: params.channel,
        externalChatId: params.externalChatId,
        phoneNumber: params.phoneNumber,
        fullName: params.fullName,
      },
      update: { fullName: params.fullName },
    });
    return this.toRecord(row);
  }

  /**
   * Promotes a claim to proven, and attaches the record it proved.
   *
   * `verifiedAt` is stamped here rather than defaulted at the column, because
   * it is the clock §8.5's `CS_LINK_REVERIFY_DAYS` measures from — a
   * verification that silently kept a creation timestamp would let a link
   * outlive its re-challenge window.
   */
  async markVerified(params: {
    linkId: string;
    patientId: string;
    verificationStatus: ChannelVerificationStatusValue;
    verifiedAt: Date;
  }): Promise<ChannelPatientLinkRecord> {
    const row = await this.prismaService.channelPatientLink.update({
      where: { id: params.linkId },
      data: {
        patientId: params.patientId,
        verificationStatus: params.verificationStatus,
        verifiedAt: params.verifiedAt,
      },
    });
    return this.toRecord(row);
  }

  private toRecord(row: ChannelPatientLinkRow): ChannelPatientLinkRecord {
    return {
      id: row.id,
      channel: row.channel,
      externalChatId: row.externalChatId,
      phoneNumber: row.phoneNumber,
      fullName: row.fullName,
      patientId: row.patientId,
      verificationStatus: row.verificationStatus,
      verifiedAt: row.verifiedAt?.toISOString() ?? null,
    };
  }
}
