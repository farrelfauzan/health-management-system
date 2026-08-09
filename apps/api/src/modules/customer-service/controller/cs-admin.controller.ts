import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { CUSTOMER_SERVICE_ADMIN_EXAMPLES } from '../../../common/openapi/customer-service-admin-examples';
import { BlockConversationDto } from '../dto/block-conversation.dto';
import { ListConversationTranscriptQueryDto } from '../dto/list-conversation-transcript-query.dto';
import { ListConversationsQueryDto } from '../dto/list-conversations-query.dto';
import { ReplyToConversationDto } from '../dto/reply-to-conversation.dto';
import { ChannelMetricsQueryDto } from '../dto/channel-metrics-query.dto';
import { ChannelMetricsService } from '../service/channel-metrics.service';
import { CsAdminService } from '../service/cs-admin.service';

/**
 * The staff view of the WhatsApp/Telegram channel (`PCS-T08`, strategy §4.2).
 *
 * Every route on it is `Conversation`-scoped and `ANY` by construction: a
 * conversation has no HMS user on either end, so there is no owned variant of
 * any of these grants and nothing for `PermissionsGuard` to be ambiguous
 * about — the opposite of the document routes, where the same guard cannot
 * tell a clinic-corpus grant from a personal one and the service must re-check.
 *
 * `block` is split from `write` because the two are different acts. Replying
 * and handing a conversation back and forth are the shift's ordinary work;
 * silencing a member of the public is an abuse-control decision (§8.3), and
 * separating the grant is what lets a clinic hand out the first without the
 * second.
 */
@ApiTags('Customer Service')
@Controller({
  version: '1',
  path: 'admin/conversations',
})
export class CsAdminController {
  constructor(
    private readonly csAdminService: CsAdminService,
    private readonly channelMetricsService: ChannelMetricsService,
  ) {}

  @Get()
  @Auth([{ action: 'read', subject: 'Conversation' }])
  @ApiEndpoint({
    summary: 'List channel conversations',
    responseDescription:
      'The inbox, most recent activity first, cursor-paginated. `filter=HANDOFF` is the queue an admin works from — NEEDS_HUMAN plus HUMAN_ACTIVE — and `filter=BLOCKED` is the only one that returns blocked chats; every other filter hides them, so a queue never hands back a conversation the clinic has stopped answering. No message bodies appear here: a preview line would put customer text into every cached list response for conversations nobody opened.',
    responseExample: {
      data: [CUSTOMER_SERVICE_ADMIN_EXAMPLES.conversation],
      meta: { nextCursor: null },
    },
  })
  async listConversations(
    @Query() query: ListConversationsQueryDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    this.assertAuthenticated(currentUser);
    const result = await this.csAdminService.listConversations(query);

    return { data: result.items, meta: { nextCursor: result.nextCursor } };
  }

  @Get('handoff-summary')
  @Auth([{ action: 'read', subject: 'Conversation' }])
  @ApiEndpoint({
    summary: 'Count the conversations waiting for a human',
    responseDescription:
      'Counts and the oldest wait, for the notification badge. Deliberately not a list: this endpoint is polled, and returning conversations would fetch the whole queue on every interval to render one number. `oldestWaitingSince` is what turns the badge into a priority — three customers waiting two minutes and one waiting forty are very different afternoons. Blocked chats are excluded from both counts.',
    responseExample: { data: CUSTOMER_SERVICE_ADMIN_EXAMPLES.handoffSummary },
  })
  async getHandoffSummary(@AuthUser() currentUser?: CurrentUser) {
    this.assertAuthenticated(currentUser);
    const view = await this.csAdminService.getHandoffSummary();

    return { data: view };
  }

  @Get('metrics')
  @Auth([{ action: 'read', subject: 'Conversation' }])
  @ApiEndpoint({
    summary: 'Read the channel’s operating metrics (§8.4)',
    responseDescription:
      'The five §8.4 metrics over a window, defaulting to fourteen days — the window the staged-rollout gate asks about, since "two clean weeks on Telegram" is the condition for announcing a WhatsApp number rather than a figure of speech. Every rate is returned next to the counts it came from: a handoff rate of 1.0 is alarming over a hundred conversations and meaningless over one. `faqNoHitRate` is null when nothing was searched, because a zero would read as "the corpus answered everything" when the truth is nobody asked it anything. Counts and ratios only — no message text, no chat ids, no names.',
    responseExample: { data: CUSTOMER_SERVICE_ADMIN_EXAMPLES.metrics },
  })
  async getMetrics(
    @Query() query: ChannelMetricsQueryDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    this.assertAuthenticated(currentUser);
    const view = await this.channelMetricsService.readMetrics(query);

    return { data: view };
  }

  @Get(':id')
  @Auth([{ action: 'read', subject: 'Conversation' }])
  @ApiEndpoint({
    summary: 'Read one conversation transcript',
    responseDescription:
      'The conversation plus a page of turns, newest first with a cursor onto older ones. Content is post-redaction: an identifier a customer volunteered never reached this table (§5.3), so it cannot be read back here either. `safetyTags` are surfaced on purpose — an admin taking over needs to see that the previous turn was an emergency escalation or a redaction rather than ordinary text.',
    responseExample: {
      data: {
        conversation: CUSTOMER_SERVICE_ADMIN_EXAMPLES.conversation,
        items: [
          CUSTOMER_SERVICE_ADMIN_EXAMPLES.adminMessage,
          CUSTOMER_SERVICE_ADMIN_EXAMPLES.customerMessage,
        ],
        nextCursor: null,
      },
    },
    notFoundDescription: 'Conversation not found.',
  })
  async getTranscript(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: ListConversationTranscriptQueryDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    this.assertAuthenticated(currentUser);
    const view = await this.csAdminService.getTranscript(id, query);

    return { data: view };
  }

  @Post(':id/takeover')
  @HttpCode(200)
  @Auth([{ action: 'write', subject: 'Conversation' }])
  @ApiEndpoint({
    summary: 'Take a conversation over from the bot',
    responseDescription:
      'Moves the conversation to HUMAN_ACTIVE, which is what pauses the bot: inbound messages are still recorded but never reach a provider. Returns 409 for a conversation in AWAITING_OTP, which is holding a live possession challenge and a booking that has not happened yet — taking it over would strand the booking and turn the customer’s code into a message a person reads. That state resolves itself within the OTP TTL.',
    responseExample: {
      data: CUSTOMER_SERVICE_ADMIN_EXAMPLES.conversation,
      message: 'Conversation taken over',
    },
    notFoundDescription: 'Conversation not found.',
  })
  async takeOver(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    this.assertAuthenticated(currentUser);
    const view = await this.csAdminService.takeOverConversation(id);

    return { data: view, message: 'Conversation taken over' };
  }

  @Post(':id/release')
  @HttpCode(200)
  @Auth([{ action: 'write', subject: 'Conversation' }])
  @ApiEndpoint({
    summary: 'Hand a conversation back to the bot',
    responseDescription:
      'Returns the conversation to BOT_ACTIVE. The human turns stay in the transcript and therefore in the model’s replay window, so the next bot reply is composed knowing what the admin already answered. Allowed on a blocked conversation — releasing is the narrowing move, and refusing it would strand a blocked chat in HUMAN_ACTIVE.',
    responseExample: {
      data: CUSTOMER_SERVICE_ADMIN_EXAMPLES.conversation,
      message: 'Conversation released to the assistant',
    },
    notFoundDescription: 'Conversation not found.',
  })
  async release(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    this.assertAuthenticated(currentUser);
    const view = await this.csAdminService.releaseConversation(id);

    return { data: view, message: 'Conversation released to the assistant' };
  }

  @Post(':id/reply')
  @Auth([{ action: 'write', subject: 'Conversation' }])
  @ApiEndpoint({
    summary: 'Reply to the customer on their original channel',
    responseDescription:
      'Sends through the same outbound dispatcher the bot uses, so the customer sees one clinic rather than two systems. Replying takes the conversation over: a reply from BOT_ACTIVE moves it to HUMAN_ACTIVE in the same call, because leaving the bot free to answer the next message over the top of a person is the failure the state machine exists to prevent. The turn is persisted before dispatch, so the transcript records what the clinic said even if delivery then failed.',
    responseExample: {
      data: CUSTOMER_SERVICE_ADMIN_EXAMPLES.adminMessage,
      message: 'Reply sent',
    },
    requestType: ReplyToConversationDto,
    requestExample: CUSTOMER_SERVICE_ADMIN_EXAMPLES.replyRequest,
    successStatus: 201,
    notFoundDescription: 'Conversation not found.',
  })
  async reply(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ReplyToConversationDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const view = await this.csAdminService.replyToConversation(id, body, actor);

    return { data: view, message: 'Reply sent' };
  }

  @Post(':id/block')
  @HttpCode(200)
  @Auth([{ action: 'block', subject: 'Conversation' }])
  @ApiEndpoint({
    summary: 'Block a chat (§8.3 abuse control)',
    responseDescription:
      'Every further inbound message from this externalChatId is dropped before persistence and before any provider call, and the chat disappears from every filter but BLOCKED. The customer is told nothing — an abuser who learns they were blocked has a signal to tune against. The reason is logged, not stored and not sent.',
    responseExample: {
      data: CUSTOMER_SERVICE_ADMIN_EXAMPLES.blockedConversation,
      message: 'Conversation blocked',
    },
    requestType: BlockConversationDto,
    requestExample: CUSTOMER_SERVICE_ADMIN_EXAMPLES.blockRequest,
    notFoundDescription: 'Conversation not found.',
  })
  async block(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: BlockConversationDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const view = await this.csAdminService.blockConversation(id, body, actor);

    return { data: view, message: 'Conversation blocked' };
  }

  @Delete(':id/block')
  @Auth([{ action: 'block', subject: 'Conversation' }])
  @ApiEndpoint({
    summary: 'Unblock a chat',
    responseDescription:
      'The conversation resumes in whatever state it was in when it was blocked, which is why the block is a column rather than a state: an admin who blocks a chat a colleague was mid-conversation on has not erased HUMAN_ACTIVE.',
    responseExample: {
      data: CUSTOMER_SERVICE_ADMIN_EXAMPLES.conversation,
      message: 'Conversation unblocked',
    },
    notFoundDescription: 'Conversation not found.',
  })
  async unblock(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const view = await this.csAdminService.unblockConversation(id, actor);

    return { data: view, message: 'Conversation unblocked' };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser) {
      throw new UnauthorizedException('Authentication required');
    }
    return currentUser;
  }
}
