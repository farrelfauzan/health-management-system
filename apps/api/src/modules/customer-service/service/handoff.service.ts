import { Injectable, Logger } from '@nestjs/common';

import { ConversationRecord, ConversationStateValue } from '@hms/shared-types';

import { NotificationService } from '../../notification/service/notification.service';
import { ConversationRepository } from '../repository/conversation.repository';

/**
 * Moves a conversation between the bot and a human (§4.2).
 *
 * Small on purpose. The state column *is* the pause — `ConversationService`
 * refuses to call a provider in any state but `BOT_ACTIVE` — so handing off is
 * a single write, and this service exists to give that write a name and one
 * place to hang notifications from (IMP-21 does exactly that). The admin
 * surface that calls `takeOver`/`release` is `PCS-T08`; `flagForHuman` is
 * called whenever the safety layer decides a message needs a person.
 */
@Injectable()
export class HandoffService {
  private readonly logger = new Logger(HandoffService.name);

  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Queues a conversation for staff. Idempotent on purpose — a customer who
   * asks for a human three times should not create three queue entries or
   * three notifications, so the staff broadcast fires only on the transition
   * into `NEEDS_HUMAN`, never on a re-flag.
   */
  async flagForHuman(conversationId: string): Promise<ConversationRecord> {
    const previousState = await this.conversationRepository.findStateById(conversationId);
    this.logger.log(`Conversation ${conversationId} flagged for human handoff`);
    const conversation = await this.updateState(conversationId, 'NEEDS_HUMAN');
    if (previousState !== 'NEEDS_HUMAN') {
      await this.notifyStaffOfHandoff(conversation);
    }
    return conversation;
  }

  /**
   * An admin takes the conversation. Distinct from `NEEDS_HUMAN` because the
   * two answer different questions for the queue: one is waiting for someone,
   * the other already has someone. Collapsing them would make an admin's
   * queue show conversations a colleague is already handling.
   */
  async takeOver(conversationId: string): Promise<ConversationRecord> {
    return this.updateState(conversationId, 'HUMAN_ACTIVE');
  }

  /**
   * Returns a conversation to the bot. The transcript keeps the human turns,
   * so the model's next reply is composed with the admin's answers in its
   * history — which is the point of persisting them under their own role
   * rather than as bot output.
   */
  async release(conversationId: string): Promise<ConversationRecord> {
    return this.updateState(conversationId, 'BOT_ACTIVE');
  }

  private async updateState(
    conversationId: string,
    state: ConversationStateValue,
  ): Promise<ConversationRecord> {
    return this.conversationRepository.updateState(conversationId, state);
  }

  /**
   * A conversation names no HMS user on either end, so the recipients are
   * resolved by grant: everyone who can read the queue. Best-effort — a
   * failed broadcast never fails the handoff itself.
   */
  private async notifyStaffOfHandoff(conversation: ConversationRecord): Promise<void> {
    try {
      await this.notificationService.createForUsersWithPermission('conversation.read:any', {
        type: 'CONVERSATION_HANDOFF',
        titleKey: 'conversationHandoff.title',
        bodyKey: 'conversationHandoff.body',
        params: { channel: conversation.channel },
        href: '/admin/conversations',
      });
    } catch (caughtError) {
      this.logger.warn(
        `Handoff notification failed for conversation ${conversation.id}: ${
          caughtError instanceof Error ? caughtError.name : 'unknown'
        }`,
      );
    }
  }
}
