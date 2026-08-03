import { Injectable } from '@nestjs/common';

import { ChatChannelValue, ChatToolNameValue } from '@hms/shared-types';

import { ActorScopeResolution } from '../../../common/authorization/actor.types';
import { AiChatbotError } from '../ai-chatbot.error';
import { ChatTool } from './chat-tool.interface';
import {
  ChatToolCaller,
  ChatToolDispatchOutcome,
  ChatToolDispatchRequest,
} from './chat-tool.types';

/**
 * Which role a session channel belongs to. The channel a session claims is
 * chosen by the client and is not evidence about who opened it
 * (ai-chatbot-tools.md §4.1.1 rule 1) — a doctor-channel session opened by a
 * non-doctor is offered no tools at all, not a reduced set.
 */
const CHANNEL_ROLE_CODES: Record<ChatChannelValue, readonly string[]> = {
  PATIENT: ['PATIENT'],
  DOCTOR: ['DOCTOR'],
  // SUPER_ADMIN is admitted alongside ADMIN because it is a superset role in
  // seed.sql, and an operator who can do everything being unable to ask how
  // long the queue is would read as a bug rather than as a control.
  ADMIN: ['ADMIN', 'SUPER_ADMIN'],
};

/**
 * The ability-filtered tool catalogue (ai-chatbot-tools.md §4.1.1). Both
 * rules live here and both fail closed: channel and role must agree before
 * any tool is considered, and a tool's required permission must resolve to
 * exactly the scope it declares — an OWN-scoped tool is withheld from an
 * actor whose grant resolves to ANY, because the broader permission
 * disqualifies rather than qualifies. The same checks run again at dispatch,
 * so the offering filter is never the only gate between a model-chosen tool
 * name and a domain service.
 */
@Injectable()
export class ChatToolRegistry {
  private readonly toolsByName = new Map<ChatToolNameValue, ChatTool>();

  registerTool(tool: ChatTool): void {
    if (this.toolsByName.has(tool.name)) {
      throw new Error(`Chat tool is already registered: ${tool.name}`);
    }
    this.toolsByName.set(tool.name, tool);
  }

  /**
   * Whether anything is registered at all — lets the orchestration skip the
   * per-message actor fetch entirely while the catalogue is empty, instead of
   * paying a query to compute an empty offer.
   */
  hasRegisteredTools(): boolean {
    return this.toolsByName.size > 0;
  }

  /**
   * The tools this caller may be offered in this channel. An empty list
   * means the wire request carries no `tools` field at all — today's
   * behaviour exactly.
   */
  listOfferedTools(caller: ChatToolCaller, channel: ChatChannelValue): ChatTool[] {
    if (!this.hasChannelRole(caller, channel)) {
      return [];
    }
    return [...this.toolsByName.values()].filter((tool) =>
      this.isToolOffered(tool, caller, channel),
    );
  }

  /**
   * Executes one model-requested call after re-running every offering rule
   * and validating the arguments. A tool that was never offered is refused
   * here identically, so a model (or an injected instruction) naming a tool
   * outside its catalogue gains nothing; a hallucinated argument fails the
   * Zod schema, never a repository.
   */
  async dispatchTool(request: ChatToolDispatchRequest): Promise<ChatToolDispatchOutcome> {
    const parsedName = this.parseToolName(request.toolName);
    const tool = parsedName === null ? undefined : this.toolsByName.get(parsedName);
    if (
      !tool ||
      !this.hasChannelRole(request.caller, request.channel) ||
      !this.isToolOffered(tool, request.caller, request.channel)
    ) {
      throw new AiChatbotError(
        'AI_TOOL_UNAVAILABLE',
        `Tool is not available to this session: ${request.toolName}`,
      );
    }
    const parsedArguments = tool.argumentSchema.safeParse(request.arguments);
    if (!parsedArguments.success) {
      throw new AiChatbotError(
        'AI_TOOL_INVALID_ARGUMENTS',
        `Arguments rejected for tool: ${tool.name}`,
      );
    }
    const result = await tool.execute(request.caller.user, parsedArguments.data);
    return { toolName: tool.name, validatedArguments: parsedArguments.data, result };
  }

  private parseToolName(toolName: string): ChatToolNameValue | null {
    return this.toolsByName.has(toolName as ChatToolNameValue)
      ? (toolName as ChatToolNameValue)
      : null;
  }

  private hasChannelRole(caller: ChatToolCaller, channel: ChatChannelValue): boolean {
    return CHANNEL_ROLE_CODES[channel].some((roleCode) => caller.roleCodes.includes(roleCode));
  }

  private isToolOffered(
    tool: ChatTool,
    caller: ChatToolCaller,
    channel: ChatChannelValue,
  ): boolean {
    if (!tool.channels.includes(channel)) {
      return false;
    }
    if (!tool.allowedRoleCodes.some((roleCode) => caller.roleCodes.includes(roleCode))) {
      return false;
    }
    return this.isRequiredScopeSatisfied(tool, caller);
  }

  /**
   * §4.1.1 rule 2. For an OWN-scoped requirement a grant resolving to ANY is
   * disqualifying, not qualifying: the tool's contract is "the rows assigned
   * to you", and the domain services treat ANY as dominant, so executing it
   * for an ANY-scoped actor would silently widen the population the tool's
   * name promises.
   */
  private isRequiredScopeSatisfied(tool: ChatTool, caller: ChatToolCaller): boolean {
    const resolution = this.resolveScope(tool, caller);
    if (tool.requiredPermission.scope === 'OWN') {
      return resolution.hasOwn && !resolution.hasAny;
    }
    return resolution.hasAny;
  }

  private resolveScope(tool: ChatTool, caller: ChatToolCaller): ActorScopeResolution {
    const matching = caller.permissions.filter(
      (permission) =>
        permission.resource === tool.requiredPermission.resource &&
        permission.action === tool.requiredPermission.action,
    );
    return {
      hasAny: matching.some((permission) => permission.scope === 'ANY'),
      hasOwn: matching.some((permission) => permission.scope === 'OWN'),
    };
  }
}
