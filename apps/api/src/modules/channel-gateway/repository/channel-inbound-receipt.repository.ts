import { Injectable } from '@nestjs/common';

import { InboundChannelMessage } from '@hms/shared-types';

import { PrismaService } from '../../../common/prisma/prisma.service';

/** Postgres' unique-violation code, as Prisma reports it. */
const UNIQUE_VIOLATION_CODE = 'P2002';

@Injectable()
export class ChannelInboundReceiptRepository {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Claims one inbound message, returning `true` when this call is the first
   * to see it and `false` when it has already been taken in.
   *
   * **The claim is the insert, not a read followed by an insert.** A
   * `findFirst` then `create` is two statements with a window between them,
   * and the exact thing being defended against is a gateway delivering the
   * same message twice in quick succession — which lands both copies in that
   * window and books an appointment twice. The unique index decides instead,
   * and the database has no window.
   *
   * A duplicate is a normal outcome and returns `false`; every other failure
   * throws, because "the database is unreachable" must not be reported to the
   * caller as "we have seen this message before" — the caller would drop a
   * message that was never handled.
   */
  async claimInboundMessage(message: InboundChannelMessage): Promise<boolean> {
    try {
      await this.prismaService.channelInboundReceipt.create({
        data: {
          channel: message.channel,
          externalChatId: message.externalChatId,
          externalMessageId: message.externalMessageId,
          sentAt: new Date(message.receivedAt),
        },
      });
      return true;
    } catch (caughtError) {
      if (this.isUniqueViolation(caughtError)) {
        return false;
      }
      throw caughtError;
    }
  }

  private isUniqueViolation(caughtError: unknown): boolean {
    return (
      typeof caughtError === 'object' &&
      caughtError !== null &&
      'code' in caughtError &&
      (caughtError as { code: unknown }).code === UNIQUE_VIOLATION_CODE
    );
  }
}
