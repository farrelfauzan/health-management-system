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

  /**
   * Admits one tool, or refuses to boot (SJ-14).
   *
   * The declaration is checked at runtime even though the interface already
   * requires it at compile time. TypeScript is the wrong last line of defence
   * here: a single `as ChatTool` — the sort of thing a test double or a
   * hurried refactor produces — satisfies the compiler and registers a tool
   * with no permission requirement at all, which `isRequiredScopeSatisfied`
   * would then evaluate against `undefined` and quietly offer to everyone.
   *
   * Failing at module init is the same posture as SJ-3's route-guard
   * coverage: the mistake becomes a process that will not start, rather than
   * a tool that works and should not.
   */
  registerTool(tool: ChatTool): void {
    if (this.toolsByName.has(tool.name)) {
      throw new Error(`Chat tool is already registered: ${tool.name}`);
    }
    assertToolIsDeclared(tool);
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

/**
 * Refuses a tool whose authorization contract is incomplete (SJ-14).
 *
 * Every field checked here is one the registry later reads to decide who may
 * call the tool. An empty `channels` or `allowedRoleCodes` would be
 * self-denying and merely useless; a missing `requiredPermission` is the
 * dangerous one, because `isRequiredScopeSatisfied` would compare against
 * `undefined` and the tool would be offered to whoever asked.
 *
 * The message names the tool and the field, because this fires at boot with
 * no request to correlate against — "chat tool declaration is invalid" alone
 * would send somebody reading eight definitions to find out which.
 */
function assertToolIsDeclared(tool: ChatTool): void {
  const problems: string[] = [];
  if (!tool.name) {
    problems.push('name is empty');
  }
  if (!tool.description?.trim()) {
    problems.push('description is empty');
  }
  if (!tool.channels?.length) {
    problems.push('channels is empty, so the tool could never be offered');
  }
  if (!tool.allowedRoleCodes?.length) {
    problems.push('allowedRoleCodes is empty, so the tool could never be offered');
  }
  const permission = tool.requiredPermission;
  if (!permission) {
    problems.push('requiredPermission is missing');
  } else {
    if (!permission.resource?.trim()) {
      problems.push('requiredPermission.resource is empty');
    }
    if (!permission.action?.trim()) {
      problems.push('requiredPermission.action is empty');
    }
    if (permission.scope !== 'ANY' && permission.scope !== 'OWN') {
      problems.push(`requiredPermission.scope must be ANY or OWN, got ${String(permission.scope)}`);
    }
  }
  if (!tool.argumentSchema) {
    problems.push('argumentSchema is missing');
  }
  if (typeof tool.execute !== 'function') {
    problems.push('execute is not a function');
  }
  if (problems.length > 0) {
    throw new Error(
      `Chat tool declaration is invalid (${String(tool.name)}): ${problems.join('; ')}`,
    );
  }
}
