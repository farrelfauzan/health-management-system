import { Injectable } from '@nestjs/common';

import {
  AppendChatMessageData,
  ChatMessagePage,
  ChatMessageRecord,
  ChatSessionPage,
  ChatSessionRecord,
  CreateChatSessionData,
  ListAllChatSessionsParams,
  ListChatMessagesParams,
  ListOwnChatSessionsParams,
} from '@hms/shared-types';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { ChatMessage, ChatSession, Prisma } from '../../../generated/prisma/client';

/**
 * Persistence for chat sessions and their append-only transcripts. Ownership
 * is enforced in the queries themselves: every `:own`-scoped read and the
 * soft delete carry `ownerUserId` in the WHERE clause, so a wrong session id
 * from another user resolves to "not found" rather than to someone else's
 * conversation. Messages have create and read methods only — no update, no
 * delete — because a transcript records what a patient was told (PMK 24/2022
 * retention); sessions soft-delete, their messages stay.
 */
@Injectable()
export class ChatRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async createSession(data: CreateChatSessionData): Promise<ChatSessionRecord> {
    const row = await this.prismaService.chatSession.create({
      data: {
        ownerUserId: data.ownerUserId,
        channel: data.channel,
        providerKey: data.providerKey,
        providerKind: data.providerKind,
        title: data.title ?? null,
      },
    });
    return this.toSessionRecord(row);
  }

  async findSessionForOwner(id: string, ownerUserId: string): Promise<ChatSessionRecord | null> {
    const row = await this.prismaService.chatSession.findFirst({
      where: { id, ownerUserId, deletedAt: null },
    });
    return row === null ? null : this.toSessionRecord(row);
  }

  /** Unscoped lookup for the admin support view (`chat.session.read:any`). */
  async findSessionById(id: string): Promise<ChatSessionRecord | null> {
    const row = await this.prismaService.chatSession.findFirst({
      where: { id, deletedAt: null },
    });
    return row === null ? null : this.toSessionRecord(row);
  }

  async listSessionsForOwner(params: ListOwnChatSessionsParams): Promise<ChatSessionPage> {
    return this.listSessions({
      ownerUserId: params.ownerUserId,
      channel: params.channel,
      cursor: params.cursor,
      limit: params.limit,
    });
  }

  /**
   * Admin support view — the only session list without a mandatory owner.
   * Kept as a separate method so an accidentally omitted `ownerUserId` on the
   * `:own` path is a compile error, not a data leak.
   */
  async listAllSessions(params: ListAllChatSessionsParams): Promise<ChatSessionPage> {
    return this.listSessions(params);
  }

  /**
   * Soft delete scoped to the owner in one statement: the count tells the
   * caller whether the session existed and was theirs, without a separate
   * read racing the write.
   */
  async softDeleteSessionForOwner(id: string, ownerUserId: string): Promise<boolean> {
    const result = await this.prismaService.chatSession.updateMany({
      where: { id, ownerUserId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return result.count > 0;
  }

  /**
   * Counts the user's own turns across every session since an instant — the
   * denominator for the per-hour rate limit. Scoped by `authorUserId` (which
   * only USER turns carry) rather than by session, so opening a second
   * conversation does not buy a fresh budget.
   */
  async countOwnMessagesSince(authorUserId: string, since: Date): Promise<number> {
    return this.prismaService.chatMessage.count({
      where: { authorUserId, actor: 'USER', createdAt: { gte: since } },
    });
  }

  /**
   * Counts sessions the user created since an instant, **including
   * soft-deleted ones**: deleting a conversation must not reset the daily
   * quota, or the limit would be one DELETE away from meaningless.
   */
  async countOwnSessionsSince(ownerUserId: string, since: Date): Promise<number> {
    return this.prismaService.chatSession.count({
      where: { ownerUserId, createdAt: { gte: since } },
    });
  }

  async appendMessage(data: AppendChatMessageData): Promise<ChatMessageRecord> {
    const row = await this.prismaService.chatMessage.create({
      data: {
        sessionId: data.sessionId,
        authorUserId: data.authorUserId ?? null,
        actor: data.actor,
        content: data.content,
        providerKind: data.providerKind ?? null,
        providerRequestId: data.providerRequestId ?? null,
        providerMessageId: data.providerMessageId ?? null,
        providerModel: data.providerModel ?? null,
        providerStatusCode: data.providerStatusCode ?? null,
        providerLatencyMs: data.providerLatencyMs ?? null,
        disclaimerShown: data.disclaimerShown ?? false,
        safetyTags: data.safetyTags ?? [],
        // Omitted -> database now(); passed -> the writer owns turn order
        // (two appends in the same millisecond tie on createdAt, and the
        // random-UUID id is no tie-break).
        createdAt: data.createdAt,
      },
    });
    return this.toMessageRecord(row);
  }

  /**
   * Transcript history in reading order, riding the `(sessionId, createdAt)`
   * index. Session ownership is the caller's check (via
   * {@link findSessionForOwner}) — messages themselves carry no owner column.
   */
  async listMessagesForSession(params: ListChatMessagesParams): Promise<ChatMessagePage> {
    const rows = await this.prismaService.chatMessage.findMany({
      where: { sessionId: params.sessionId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: params.limit + 1,
      ...(params.cursor === undefined ? {} : { cursor: { id: params.cursor }, skip: 1 }),
    });
    const pageRows = rows.slice(0, params.limit);
    return {
      items: pageRows.map((row) => this.toMessageRecord(row)),
      nextCursor: rows.length > params.limit ? (pageRows.at(-1)?.id ?? null) : null,
    };
  }

  private async listSessions(params: ListAllChatSessionsParams): Promise<ChatSessionPage> {
    const rows = await this.prismaService.chatSession.findMany({
      where: {
        ownerUserId: params.ownerUserId,
        channel: params.channel,
        deletedAt: null,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: params.limit + 1,
      ...(params.cursor === undefined ? {} : { cursor: { id: params.cursor }, skip: 1 }),
    });
    const pageRows = rows.slice(0, params.limit);
    return {
      items: pageRows.map((row) => this.toSessionRecord(row)),
      nextCursor: rows.length > params.limit ? (pageRows.at(-1)?.id ?? null) : null,
    };
  }

  private toSessionRecord(row: ChatSession): ChatSessionRecord {
    return {
      id: row.id,
      ownerUserId: row.ownerUserId,
      channel: row.channel,
      providerKey: row.providerKey,
      providerKind: row.providerKind,
      providerSessionId: row.providerSessionId,
      title: row.title,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toMessageRecord(row: ChatMessage): ChatMessageRecord {
    return {
      id: row.id,
      sessionId: row.sessionId,
      authorUserId: row.authorUserId,
      actor: row.actor,
      content: row.content,
      providerKind: row.providerKind,
      providerRequestId: row.providerRequestId,
      providerMessageId: row.providerMessageId,
      providerModel: row.providerModel,
      providerStatusCode: row.providerStatusCode,
      providerLatencyMs: row.providerLatencyMs,
      disclaimerShown: row.disclaimerShown,
      safetyTags: this.toSafetyTags(row.safetyTags),
      createdAt: row.createdAt,
    };
  }

  /**
   * The column is JSON for forward-compatibility, but every HMS writer stores
   * a string array; anything else (or a null from a pre-P13 row) normalizes
   * to empty rather than leaking a raw JSON shape into the record type.
   */
  private toSafetyTags(value: Prisma.JsonValue | null): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter((item): item is string => typeof item === 'string');
  }
}
