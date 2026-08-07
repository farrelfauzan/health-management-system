import { Injectable } from '@nestjs/common';

import {
  ChannelKindValue,
  ConversationMessageRoleValue,
  ConversationRecord,
  ConversationStateValue,
  ConversationTurn,
  CsSafetyTagValue,
  InboundChannelMessage,
} from '@hms/shared-types';

import { PrismaService } from '../../../common/prisma/prisma.service';

type ConversationRow = {
  id: string;
  channel: ChannelKindValue;
  externalChatId: string;
  senderDisplayName: string | null;
  state: ConversationStateValue;
  hasSentNotice: boolean;
  lastMessageAt: Date;
};

@Injectable()
export class ConversationRepository {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Finds the conversation for a chat, creating it on first contact.
   *
   * An upsert rather than a find-then-create: two messages arriving together
   * from a chat nobody has seen before would otherwise both find nothing and
   * both insert, and the unique index would fail the second — turning a
   * customer's first message into an error. The display name is refreshed on
   * every message because people rename themselves, and the handoff queue
   * should show what they are called now.
   */
  async findOrCreateConversation(message: InboundChannelMessage): Promise<ConversationRecord> {
    const row = await this.prismaService.conversation.upsert({
      where: {
        channel_externalChatId: {
          channel: message.channel,
          externalChatId: message.externalChatId,
        },
      },
      create: {
        channel: message.channel,
        externalChatId: message.externalChatId,
        senderDisplayName: message.senderDisplayName,
        lastMessageAt: new Date(message.receivedAt),
      },
      update: {
        senderDisplayName: message.senderDisplayName,
        lastMessageAt: new Date(message.receivedAt),
      },
    });
    return this.toRecord(row);
  }

  /**
   * Appends one turn. There is no update and no delete on this table by
   * design (§8.2) — a transcript that can be edited is not evidence of what
   * was said.
   */
  async appendMessage(params: {
    conversationId: string;
    role: ConversationMessageRoleValue;
    content: string;
    safetyTags: readonly CsSafetyTagValue[];
  }): Promise<void> {
    await this.prismaService.conversationMessage.create({
      data: {
        conversationId: params.conversationId,
        role: params.role,
        content: params.content,
        safetyTags: [...params.safetyTags],
      },
    });
  }

  /**
   * The replay window, oldest-first.
   *
   * Selected newest-first and reversed rather than ordered ascending with an
   * offset: the window is the *last* N turns, and an ascending query would
   * have to count the whole conversation to find where they start.
   */
  async listRecentTurns(conversationId: string, limit: number): Promise<ConversationTurn[]> {
    const rows = await this.prismaService.conversationMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { role: true, content: true },
    });
    return rows.reverse().map((row) => ({
      role: row.role as ConversationMessageRoleValue,
      content: row.content,
    }));
  }

  async updateState(
    conversationId: string,
    state: ConversationStateValue,
  ): Promise<ConversationRecord> {
    const row = await this.prismaService.conversation.update({
      where: { id: conversationId },
      data: { state },
    });
    return this.toRecord(row);
  }

  async markNoticeSent(conversationId: string): Promise<void> {
    await this.prismaService.conversation.update({
      where: { id: conversationId },
      data: { hasSentNotice: true },
    });
  }

  /**
   * How many messages this customer has sent in the window, for §8.3's
   * per-chat limit. Counts `CUSTOMER` turns only — the bot's own replies must
   * not consume a customer's allowance.
   */
  async countCustomerMessagesSince(conversationId: string, since: Date): Promise<number> {
    return this.prismaService.conversationMessage.count({
      where: { conversationId, role: 'CUSTOMER', createdAt: { gte: since } },
    });
  }

  private toRecord(row: ConversationRow): ConversationRecord {
    return {
      id: row.id,
      channel: row.channel,
      externalChatId: row.externalChatId,
      senderDisplayName: row.senderDisplayName,
      state: row.state,
      hasSentNotice: row.hasSentNotice,
      lastMessageAt: row.lastMessageAt.toISOString(),
    };
  }
}
