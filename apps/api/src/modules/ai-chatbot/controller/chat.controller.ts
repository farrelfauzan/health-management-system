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
  UseFilters,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { AI_CHAT_EXAMPLES } from '../../../common/openapi/ai-chat-examples';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { CreateChatSessionDto } from '../dto/create-chat-session.dto';
import { ListChatMessagesQueryDto } from '../dto/list-chat-messages-query.dto';
import { ListChatSessionsQueryDto } from '../dto/list-chat-sessions-query.dto';
import { SendChatMessageDto } from '../dto/send-chat-message.dto';
import { AiChatbotService } from '../service/ai-chatbot.service';
import { AiChatbotExceptionFilter } from './ai-chatbot-exception.filter';

/**
 * The patient- and doctor-facing chat surface. Every route is `:own`-scoped
 * except the admin support list: ownership is enforced in the repository's
 * queries, so a foreign session id answers 404 rather than 403 — which id
 * exists in another user's account is itself information.
 */
@ApiTags('AI Chatbot')
@UseFilters(AiChatbotExceptionFilter)
@Controller({
  version: '1',
  path: 'chat',
})
export class ChatController {
  constructor(private readonly chatbotService: AiChatbotService) {}

  @Get('availability')
  @Auth([{ action: 'create', subject: 'ChatSession' }])
  @ApiEndpoint({
    summary: 'Check whether chat can answer right now',
    responseDescription:
      'Whether a message sent now would be answered, plus the two reasons behind it: the deployment feature flag and whether a usable provider configuration is active. The provider is resolved exactly as sending a message would resolve it, so a misconfigured provider reads as unavailable here rather than as a working chat that fails on the first question. Clients gate the chat entry point on isAvailable rather than discovering the state from a failed send.',
    responseExample: { data: AI_CHAT_EXAMPLES.availability },
  })
  async getAvailability(@AuthUser() currentUser?: CurrentUser) {
    this.assertAuthenticated(currentUser);
    const view = await this.chatbotService.getAvailability();

    return { data: view };
  }

  @Post('sessions')
  @Auth([{ action: 'create', subject: 'ChatSession' }])
  @ApiEndpoint({
    summary: 'Start a chat session',
    responseDescription:
      'The created session, stamped with the provider configuration that will answer it so the transcript stays auditable after a credential rotation. Returns 503 when chat is disabled or no provider is configured, and 429 once the daily session quota is reached.',
    responseExample: { data: AI_CHAT_EXAMPLES.session, message: 'Chat session created' },
    requestType: CreateChatSessionDto,
    requestExample: AI_CHAT_EXAMPLES.createSessionRequest,
    successStatus: 201,
  })
  async createSession(
    @Body() body: CreateChatSessionDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const view = await this.chatbotService.createSession(body, actor);

    return { data: view, message: 'Chat session created' };
  }

  @Get('sessions')
  @Auth([{ action: 'read', subject: 'ChatSession' }])
  @ApiEndpoint({
    summary: 'List your own chat sessions',
    responseDescription:
      'Your live sessions, newest first, cursor-paginated. Pass the returned nextCursor back verbatim to resume after the last item; it is null on the final page.',
    responseExample: {
      data: [AI_CHAT_EXAMPLES.session],
      meta: AI_CHAT_EXAMPLES.sessionListMeta,
    },
  })
  async listSessions(
    @Query() query: ListChatSessionsQueryDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const result = await this.chatbotService.listOwnSessions(query, actor);

    return { data: result.items, meta: { nextCursor: result.nextCursor } };
  }

  /**
   * Declared before `sessions/:id` on purpose: Nest matches routes in
   * declaration order, so the literal path has to win over the parameter.
   */
  @Get('admin/sessions')
  @Auth([{ action: 'read', subject: 'ChatSession' }])
  @ApiEndpoint({
    summary: 'List every chat session (admin support view)',
    responseDescription:
      'All owners’ live sessions with the owner id, for support triage. Requires the ANY-scoped chat.session.read grant — an OWN-only holder gets 403 here rather than a silently narrowed list. Carries no transcript: reading a conversation is a separate request against that session.',
    responseExample: {
      data: [AI_CHAT_EXAMPLES.adminSession],
      meta: AI_CHAT_EXAMPLES.sessionListMeta,
    },
  })
  async listAllSessions(
    @Query() query: ListChatSessionsQueryDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const result = await this.chatbotService.listAllSessions(query, actor);

    return { data: result.items, meta: { nextCursor: result.nextCursor } };
  }

  @Get('sessions/:id')
  @Auth([{ action: 'read', subject: 'ChatSession' }])
  @ApiEndpoint({
    summary: 'Read one of your chat sessions',
    responseDescription:
      'Session detail. A session belonging to another user answers 404, not 403: whether an id exists in someone else’s account is itself information.',
    responseExample: { data: AI_CHAT_EXAMPLES.session },
    notFoundDescription: 'Chat session not found.',
  })
  async getSession(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const view = await this.chatbotService.getOwnSession(id, actor);

    return { data: view };
  }

  @Delete('sessions/:id')
  @Auth([{ action: 'delete', subject: 'ChatSession' }])
  @ApiEndpoint({
    summary: 'Delete one of your chat sessions',
    responseDescription:
      'Soft-deletes the session so it leaves your list. The transcript itself is retained: PMK 24/2022 requires the record of what a patient was told to survive, and the daily session quota counts deleted sessions so a delete cannot reset it.',
    responseExample: { data: AI_CHAT_EXAMPLES.deletedSession, message: 'Chat session deleted' },
    notFoundDescription: 'Chat session not found.',
  })
  async deleteSession(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const result = await this.chatbotService.deleteOwnSession(id, actor);

    return { data: result, message: 'Chat session deleted' };
  }

  @Post('sessions/:id/messages')
  @HttpCode(200)
  @Auth([{ action: 'create', subject: 'ChatMessage' }])
  @ApiEndpoint({
    summary: 'Send a message and receive the assistant’s reply',
    responseDescription:
      'Returns both persisted turns. The mandatory disclaimer is in meta, never inside the assistant content — render the reply only together with it. When retrieval is enabled and the clinic corpus had something to say, meta.citations names the documents the reply was allowed to draw on, numbered to match the [n] markers in the reply text; a marker with no matching citation was invented by the model and resolves to nothing. Emergency messages are answered from a fixed escalation template without contacting any provider. Returns 422 when the safety guards refuse the message, 429 on the hourly limit, 502/504 when the provider fails, and 503 when chat is disabled or unconfigured.',
    responseExample: {
      data: {
        userMessage: AI_CHAT_EXAMPLES.userMessage,
        assistantMessage: AI_CHAT_EXAMPLES.assistantMessage,
      },
      meta: AI_CHAT_EXAMPLES.exchangeMeta,
    },
    requestType: SendChatMessageDto,
    requestExample: AI_CHAT_EXAMPLES.sendMessageRequest,
    notFoundDescription: 'Chat session not found.',
  })
  async sendMessage(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: SendChatMessageDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const result = await this.chatbotService.sendMessage(id, body, actor);

    return { data: result.data, meta: result.meta };
  }

  @Get('sessions/:id/messages')
  @Auth([{ action: 'read', subject: 'ChatMessage' }])
  @ApiEndpoint({
    summary: 'Read a session transcript',
    responseDescription:
      'Turns in conversation order, cursor-paginated. SYSTEM turns are part of the record — they hold the redacted context that was sent to the provider — so a client rendering the conversation should display USER and ASSISTANT turns only.',
    responseExample: {
      data: [AI_CHAT_EXAMPLES.userMessage, AI_CHAT_EXAMPLES.assistantMessage],
      meta: { nextCursor: null },
    },
    notFoundDescription: 'Chat session not found.',
  })
  async listMessages(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: ListChatMessagesQueryDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const result = await this.chatbotService.listOwnSessionMessages(id, query, actor);

    return { data: result.items, meta: { nextCursor: result.nextCursor } };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser) {
      throw new UnauthorizedException('Authentication required');
    }
    return currentUser;
  }
}
