import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import {
  AdminConversationListView,
  AdminConversationMessageRecord,
  AdminConversationMessageView,
  AdminConversationRecord,
  AdminConversationTranscriptView,
  AdminConversationView,
  BlockConversationInput,
  ConversationHandoffSummaryView,
  ConversationInboxFilterValue,
  ConversationStateValue,
  ListConversationsQueryInput,
  ListConversationTranscriptQueryInput,
  ReplyToConversationInput,
} from '@hms/shared-types';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { OutboundMessageDispatcherService } from '../../channel-gateway/service/outbound-message-dispatcher.service';
import { AdminConversationRepository } from '../repository/admin-conversation.repository';
import { HandoffService } from './handoff.service';

/**
 * Which states each inbox filter selects. `undefined` means "do not filter on
 * state at all", which is a different query from "every state listed" once
 * `ARCHIVED` exists.
 */
const FILTER_STATES: Record<
  ConversationInboxFilterValue,
  readonly ConversationStateValue[] | undefined
> = {
  ALL: undefined,
  HANDOFF: ['NEEDS_HUMAN', 'HUMAN_ACTIVE'],
  NEEDS_HUMAN: ['NEEDS_HUMAN'],
  HUMAN_ACTIVE: ['HUMAN_ACTIVE'],
  BOT_ACTIVE: ['BOT_ACTIVE'],
  AWAITING_OTP: ['AWAITING_OTP'],
  ARCHIVED: ['ARCHIVED'],
  BLOCKED: undefined,
};

/**
 * The states a human may take a conversation over from (`PCS-T08`, §4.2).
 *
 * `AWAITING_OTP` is deliberately absent, and it is the one exclusion worth
 * explaining. A conversation in that state is holding a live possession
 * challenge and a booking that has not happened yet (§5.1.1); the customer's
 * next message is matched against a hash, and an admin who takes over would
 * both strand that booking and turn the customer's code into an ordinary
 * message a person now reads. The state resolves itself within the OTP TTL, so
 * the wait is bounded — refusing is a delay, taking over is a lost booking.
 *
 * `ARCHIVED` is absent because a chat nobody has spoken in for thirty days is
 * not a conversation to answer; a new inbound message revives it on its own.
 */
const TAKEOVER_ALLOWED_STATES = [
  'BOT_ACTIVE',
  'NEEDS_HUMAN',
  'HUMAN_ACTIVE',
] as const satisfies readonly ConversationStateValue[];

/**
 * The admin half of the channel (`PCS-T08`, strategy §4.2, §8.3).
 *
 * Everything here is one of three things: reading a transcript, moving a
 * conversation between the bot and a person, or speaking to the customer as
 * the clinic. The third is why this service holds the outbound dispatcher —
 * an admin reply travels the *same* path a bot reply does, which is what makes
 * "the customer sees one clinic, not two systems" true at the wire rather than
 * by convention.
 *
 * Permission checks are not repeated here. Unlike `DocumentService`, whose
 * routes carry both an `:own` and an `:any` grant that `PermissionsGuard`
 * cannot tell apart, every permission on this surface exists only in its `ANY`
 * form — there is no owned conversation, because a conversation has no HMS
 * user on either end. The guard's decision is therefore the whole decision.
 */
@Injectable()
export class CsAdminService {
  private readonly logger = new Logger(CsAdminService.name);

  constructor(
    private readonly adminConversationRepository: AdminConversationRepository,
    private readonly handoffService: HandoffService,
    private readonly outboundDispatcher: OutboundMessageDispatcherService,
  ) {}

  async listConversations(
    query: ListConversationsQueryInput,
  ): Promise<AdminConversationListView> {
    const states = FILTER_STATES[query.filter];
    const result = await this.adminConversationRepository.listConversations({
      ...(states === undefined ? {} : { states }),
      ...(query.channel === undefined ? {} : { channel: query.channel }),
      // A blocked chat is hidden from every other filter, not just excluded
      // from `ALL`: an admin working the handoff queue must not be handed a
      // conversation they have already decided to stop answering.
      isBlocked: query.filter === 'BLOCKED',
      ...(query.search === undefined ? {} : { search: query.search }),
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
      limit: query.limit,
    });
    const now = new Date();
    return {
      items: result.items.map((record) => this.toConversationView(record, now)),
      nextCursor: result.nextCursor,
    };
  }

  async getHandoffSummary(): Promise<ConversationHandoffSummaryView> {
    return this.adminConversationRepository.countHandoffQueue();
  }

  async getTranscript(
    conversationId: string,
    query: ListConversationTranscriptQueryInput,
  ): Promise<AdminConversationTranscriptView> {
    const conversation = await this.requireConversation(conversationId);
    const result = await this.adminConversationRepository.listMessages({
      conversationId,
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
      limit: query.limit,
    });
    return {
      conversation: this.toConversationView(conversation, new Date()),
      items: result.items.map((record) => this.toMessageView(record)),
      nextCursor: result.nextCursor,
    };
  }

  /** Moves a conversation to `HUMAN_ACTIVE`, pausing the bot (§4.2). */
  async takeOverConversation(
    conversationId: string,
  ): Promise<AdminConversationView> {
    const conversation = await this.requireConversation(conversationId);
    this.assertTakeable(conversation);
    await this.handoffService.takeOver(conversationId);
    return this.reloadView(conversationId);
  }

  /**
   * Returns a conversation to the bot.
   *
   * Allowed from a blocked conversation, unlike takeover and reply: releasing
   * is the *narrowing* move, and refusing it would leave a blocked chat stuck
   * in `HUMAN_ACTIVE` with no way back short of unblocking first.
   */
  async releaseConversation(
    conversationId: string,
  ): Promise<AdminConversationView> {
    const conversation = await this.requireConversation(conversationId);
    if (conversation.state === 'AWAITING_OTP') {
      throw new ConflictException(
        'This conversation is resolving a verification step and cannot be released yet',
      );
    }
    await this.handoffService.release(conversationId);
    return this.reloadView(conversationId);
  }

  /**
   * An admin speaks to the customer on their original channel.
   *
   * **Replying takes the conversation over.** A reply from a `BOT_ACTIVE`
   * conversation moves it to `HUMAN_ACTIVE` in the same call rather than being
   * refused, because the alternative outcomes are both worse than an implicit
   * transition: refusing costs a click at the exact moment someone is trying to
   * answer a waiting customer, and allowing the reply *without* the transition
   * leaves the bot free to answer the customer's next message over the top of a
   * person — two voices in one chat, which is the failure the state machine
   * exists to prevent.
   *
   * The turn is persisted before dispatch, the same order the bot path uses
   * (§4.2), so the transcript records what the clinic decided to say even when
   * the gateway then failed to carry it.
   */
  async replyToConversation(
    conversationId: string,
    payload: ReplyToConversationInput,
    currentUser: CurrentUser,
  ): Promise<AdminConversationMessageView> {
    const conversation = await this.requireConversation(conversationId);
    this.assertTakeable(conversation);
    if (conversation.state !== 'HUMAN_ACTIVE') {
      await this.handoffService.takeOver(conversationId);
    }
    const message = await this.adminConversationRepository.appendAdminMessage({
      conversationId,
      content: payload.text,
      authorUserId: currentUser.sub,
    });
    await this.outboundDispatcher.sendMessage({
      channel: conversation.channel,
      externalChatId: conversation.externalChatId,
      text: payload.text,
    });
    return this.toMessageView(message);
  }

  /**
   * §8.3's chat block.
   *
   * The reason is written to the log and not to the row, and not to the
   * customer. There is no column for it because the useful audit question is
   * "who blocked this chat and when" — both of which are columns — while the
   * reason is prose that would sit in a table nothing queries; and telling the
   * customer would hand an abuser a feedback signal to tune against.
   */
  async blockConversation(
    conversationId: string,
    payload: BlockConversationInput,
    currentUser: CurrentUser,
  ): Promise<AdminConversationView> {
    const conversation = await this.requireConversation(conversationId);
    if (conversation.blockedAt !== null) {
      throw new ConflictException('This conversation is already blocked');
    }
    this.logger.warn(
      buildSafeErrorLog('cs_conversation_blocked', {
        conversationId,
        channel: conversation.channel,
        actorUserId: currentUser.sub,
        // The reason itself is prose an admin typed about a member of the
        // public; the log records that one was given, not what it said.
        hasReason: payload.reason === undefined ? 'no' : 'yes',
      }),
    );
    const updated = await this.adminConversationRepository.setBlocked({
      conversationId,
      blockedAt: new Date(),
      blockedById: currentUser.sub,
    });
    return this.toConversationView(updated, new Date());
  }

  async unblockConversation(
    conversationId: string,
    currentUser: CurrentUser,
  ): Promise<AdminConversationView> {
    const conversation = await this.requireConversation(conversationId);
    if (conversation.blockedAt === null) {
      throw new ConflictException('This conversation is not blocked');
    }
    this.logger.warn(
      buildSafeErrorLog('cs_conversation_unblocked', {
        conversationId,
        channel: conversation.channel,
        actorUserId: currentUser.sub,
      }),
    );
    const updated = await this.adminConversationRepository.setBlocked({
      conversationId,
      blockedAt: null,
      blockedById: null,
    });
    return this.toConversationView(updated, new Date());
  }

  private assertTakeable(conversation: AdminConversationRecord): void {
    if (conversation.blockedAt !== null) {
      throw new ConflictException('This conversation is blocked; unblock it before replying');
    }
    if (!TAKEOVER_ALLOWED_STATES.some((state) => state === conversation.state)) {
      throw new ConflictException(
        `A conversation in ${conversation.state} cannot be taken over`,
      );
    }
  }

  private async requireConversation(conversationId: string): Promise<AdminConversationRecord> {
    const conversation =
      await this.adminConversationRepository.findConversationById(conversationId);
    if (conversation === null) {
      throw new NotFoundException('Conversation not found');
    }
    return conversation;
  }

  private async reloadView(conversationId: string): Promise<AdminConversationView> {
    const conversation = await this.requireConversation(conversationId);
    return this.toConversationView(conversation, new Date());
  }

  private toConversationView(
    record: AdminConversationRecord,
    now: Date,
  ): AdminConversationView {
    return {
      id: record.id,
      channel: record.channel,
      externalChatId: record.externalChatId,
      senderDisplayName: record.senderDisplayName,
      state: record.state,
      isBlocked: record.blockedAt !== null,
      blockedAt: record.blockedAt,
      waitingForSeconds:
        record.state === 'NEEDS_HUMAN'
          ? Math.max(
              0,
              Math.floor((now.getTime() - Date.parse(record.lastMessageAt)) / MS_PER_SECOND),
            )
          : null,
      messageCount: record.messageCount,
      lastMessageAt: record.lastMessageAt,
      createdAt: record.createdAt,
    };
  }

  private toMessageView(record: AdminConversationMessageRecord): AdminConversationMessageView {
    return {
      id: record.id,
      role: record.role,
      content: record.content,
      authorUserId: record.authorUserId,
      authorEmail: record.authorEmail,
      safetyTags: record.safetyTags,
      createdAt: record.createdAt,
    };
  }
}

const MS_PER_SECOND = 1_000;
