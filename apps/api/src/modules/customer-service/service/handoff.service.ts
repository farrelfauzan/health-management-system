import { Injectable, Logger } from '@nestjs/common';

import { ConversationRecord, ConversationStateValue } from '@hms/shared-types';

import { ConversationRepository } from '../repository/conversation.repository';

/**
 * Moves a conversation between the bot and a human (§4.2).
 *
 * Small on purpose. The state column *is* the pause — `ConversationService`
 * refuses to call a provider in any state but `BOT_ACTIVE` — so handing off is
 * a single write, and this service exists to give that write a name and one
 * place to add notification from. The admin surface that calls
 * `takeOver`/`release` is `PCS-T08`; `flagForHuman` is already wired, called
 * whenever the safety layer decides a message needs a person.
 */
@Injectable()
export class HandoffService {
  private readonly logger = new Logger(HandoffService.name);

  constructor(private readonly conversationRepository: ConversationRepository) {}

  /**
   * Queues a conversation for staff. Idempotent by nature — flagging one that
   * is already flagged is the same write — which matters because a customer
   * who asks for a human three times should not create three queue entries or
   * three notifications.
   */
  async flagForHuman(conversationId: string): Promise<ConversationRecord> {
    this.logger.log(`Conversation ${conversationId} flagged for human handoff`);
    return this.updateState(conversationId, 'NEEDS_HUMAN');
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
}
