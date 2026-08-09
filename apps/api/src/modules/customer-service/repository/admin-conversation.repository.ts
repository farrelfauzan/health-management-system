import { Injectable } from '@nestjs/common';

import {
  AdminConversationMessageRecord,
  AdminConversationRecord,
  ChannelKindValue,
  ConversationHandoffCounts,
  ConversationMessageRoleValue,
  ConversationStateValue,
  ListAdminConversationsParams,
} from '@hms/shared-types';

import { PrismaService } from '../../../common/prisma/prisma.service';

type ConversationRow = {
  id: string;
  channel: ChannelKindValue;
  externalChatId: string;
  senderDisplayName: string | null;
  state: ConversationStateValue;
  blockedAt: Date | null;
  blockedById: string | null;
  lastMessageAt: Date;
  createdAt: Date;
  _count: { messages: number };
};

type ConversationMessageRow = {
  id: string;
  role: ConversationMessageRoleValue;
  content: string;
  authorUserId: string | null;
  safetyTags: string[];
  createdAt: Date;
  author: { email: string } | null;
};

/**
 * The read and write side of the admin inbox (`PCS-T08`, §4.2).
 *
 * Separate from {@link ConversationRepository} rather than folded into it, and
 * the split is along who calls: that one runs on the inbound message path,
 * where every extra column and every join is paid on each webhook, and this one
 * runs on a staff screen where a message count and an author join are exactly
 * what is wanted. Sharing a repository would mean one of the two callers is
 * always carrying the other's cost.
 */
@Injectable()
export class AdminConversationRepository {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * One page of the inbox, newest activity first.
   *
   * Cursor pagination is keyed on `(lastMessageAt, id)` rather than on `id`
   * alone, because the sort is by activity and an id cursor over a non-id sort
   * silently skips or repeats rows the moment two conversations share a
   * timestamp — which on this channel happens whenever a burst arrives.
   */
  async listConversations(
    params: ListAdminConversationsParams,
  ): Promise<{ items: AdminConversationRecord[]; nextCursor: string | null }> {
    const cursorRow =
      params.cursor === undefined
        ? null
        : await this.prismaService.conversation.findUnique({
            where: { id: params.cursor },
            select: { lastMessageAt: true, id: true },
          });
    const rows = await this.prismaService.conversation.findMany({
      where: {
        ...(params.states === undefined ? {} : { state: { in: [...params.states] } }),
        ...(params.channel === undefined ? {} : { channel: params.channel }),
        ...(params.isBlocked === undefined
          ? {}
          : { blockedAt: params.isBlocked ? { not: null } : null }),
        ...(params.search === undefined ? {} : this.buildSearchFilter(params.search)),
        ...(cursorRow === null
          ? {}
          : {
              OR: [
                { lastMessageAt: { lt: cursorRow.lastMessageAt } },
                { lastMessageAt: cursorRow.lastMessageAt, id: { lt: cursorRow.id } },
              ],
            }),
      },
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      take: params.limit + 1,
      include: { _count: { select: { messages: true } } },
    });
    const items = rows.slice(0, params.limit).map((row) => this.toRecord(row));
    const nextCursor = rows.length > params.limit ? (items.at(-1)?.id ?? null) : null;
    return { items, nextCursor };
  }

  async findConversationById(id: string): Promise<AdminConversationRecord | null> {
    const row = await this.prismaService.conversation.findUnique({
      where: { id },
      include: { _count: { select: { messages: true } } },
    });
    return row === null ? null : this.toRecord(row);
  }

  /**
   * One page of a transcript, newest first with a cursor onto older turns.
   *
   * `createdAt` alone is not a stable sort here: a customer turn and the reply
   * it produced can land in the same millisecond, and a transcript that shows
   * an answer above its question is worse than a slow one. The id tiebreak is
   * what keeps the order the order things happened in.
   */
  async listMessages(params: {
    conversationId: string;
    cursor?: string;
    limit: number;
  }): Promise<{ items: AdminConversationMessageRecord[]; nextCursor: string | null }> {
    const cursorRow =
      params.cursor === undefined
        ? null
        : await this.prismaService.conversationMessage.findUnique({
            where: { id: params.cursor },
            select: { createdAt: true, id: true },
          });
    const rows = await this.prismaService.conversationMessage.findMany({
      where: {
        conversationId: params.conversationId,
        ...(cursorRow === null
          ? {}
          : {
              OR: [
                { createdAt: { lt: cursorRow.createdAt } },
                { createdAt: cursorRow.createdAt, id: { lt: cursorRow.id } },
              ],
            }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: params.limit + 1,
      include: { author: { select: { email: true } } },
    });
    const items = rows.slice(0, params.limit).map((row) => this.toMessageRecord(row));
    const nextCursor = rows.length > params.limit ? (items.at(-1)?.id ?? null) : null;
    return { items, nextCursor };
  }

  /**
   * The badge's three numbers, in two queries rather than by listing the queue.
   *
   * `oldestWaitingSince` reads `lastMessageAt` and not `updatedAt`: the wait a
   * customer is experiencing started when they last spoke, and `updatedAt`
   * moves whenever staff touch the row — so an admin who opens a conversation
   * and does nothing would reset the very number telling them it was urgent.
   */
  async countHandoffQueue(): Promise<ConversationHandoffCounts> {
    const [grouped, oldest] = await Promise.all([
      this.prismaService.conversation.groupBy({
        by: ['state'],
        where: { state: { in: ['NEEDS_HUMAN', 'HUMAN_ACTIVE'] }, blockedAt: null },
        _count: { _all: true },
      }),
      this.prismaService.conversation.findFirst({
        where: { state: 'NEEDS_HUMAN', blockedAt: null },
        orderBy: { lastMessageAt: 'asc' },
        select: { lastMessageAt: true },
      }),
    ]);
    const countFor = (state: ConversationStateValue): number =>
      grouped.find((entry) => entry.state === state)?._count._all ?? 0;
    return {
      needsHumanCount: countFor('NEEDS_HUMAN'),
      humanActiveCount: countFor('HUMAN_ACTIVE'),
      oldestWaitingSince: oldest?.lastMessageAt.toISOString() ?? null,
    };
  }

  /**
   * Appends an admin turn.
   *
   * The same append-only discipline as every other turn (§8.2): staff replies
   * are part of the record of what a customer was told, and a transcript whose
   * human half could be edited would be worth less as evidence than one with
   * no human half at all.
   */
  async appendAdminMessage(params: {
    conversationId: string;
    content: string;
    authorUserId: string;
  }): Promise<AdminConversationMessageRecord> {
    const row = await this.prismaService.conversationMessage.create({
      data: {
        conversationId: params.conversationId,
        role: 'ADMIN',
        content: params.content,
        authorUserId: params.authorUserId,
        safetyTags: [],
      },
      include: { author: { select: { email: true } } },
    });
    return this.toMessageRecord(row);
  }

  async setBlocked(params: {
    conversationId: string;
    blockedAt: Date | null;
    blockedById: string | null;
  }): Promise<AdminConversationRecord> {
    const row = await this.prismaService.conversation.update({
      where: { id: params.conversationId },
      data: { blockedAt: params.blockedAt, blockedById: params.blockedById },
      include: { _count: { select: { messages: true } } },
    });
    return this.toRecord(row);
  }

  /**
   * Search is over the display name and the chat id, never the transcript.
   *
   * Indexing message bodies would undo §5.3 by construction: redaction exists
   * so a volunteered identifier is not kept, and a search that reads `content`
   * is a second reason to keep every body queryable forever.
   */
  private buildSearchFilter(search: string) {
    return {
      OR: [
        { senderDisplayName: { contains: search, mode: 'insensitive' as const } },
        { externalChatId: { contains: search } },
      ],
    };
  }

  private toRecord(row: ConversationRow): AdminConversationRecord {
    return {
      id: row.id,
      channel: row.channel,
      externalChatId: row.externalChatId,
      senderDisplayName: row.senderDisplayName,
      state: row.state,
      blockedAt: row.blockedAt?.toISOString() ?? null,
      blockedById: row.blockedById,
      messageCount: row._count.messages,
      lastMessageAt: row.lastMessageAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toMessageRecord(row: ConversationMessageRow): AdminConversationMessageRecord {
    return {
      id: row.id,
      role: row.role,
      content: row.content,
      authorUserId: row.authorUserId,
      authorEmail: row.author?.email ?? null,
      safetyTags: row.safetyTags,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
