import { Injectable } from '@nestjs/common';

import { CsToolNameValue } from '@hms/shared-types';

import { CustomerServiceError } from '../customer-service.error';
import { CsTool } from './cs-tool.interface';
import { CsToolDispatchOutcome, CsToolDispatchRequest } from './cs-tool.types';

/**
 * The public channel's tool catalogue and the only way into it (strategy
 * §4.2).
 *
 * **The registry has no ability filter, and that is not an omission.** The
 * in-app registry spends most of its length deciding which tools a caller may
 * be offered, because its callers are signed-in people with different roles.
 * Here every caller is the same caller: an unauthenticated member of the
 * public. There is nothing to filter *by*, so the boundary has to be somewhere
 * else — and it is the catalogue itself. Three tools, none of which reads a
 * patient record, means the answer to "what could a prompt injection reach?"
 * is the same for every conversation and is provable by reading three files.
 *
 * What this class does enforce, on every call and fail-closed both ways:
 *
 * 1. **The name must be one it registered.** A model naming anything else —
 *    including a tool that exists in the in-app registry — gets a refusal, not
 *    a lookup.
 * 2. **Arguments are parsed, not trusted.** A hallucinated field fails the Zod
 *    schema and never reaches a domain service.
 * 3. **Results are projected through the tool's output allowlist.** A field
 *    the schema does not name is stripped; a shape that does not match at all
 *    is refused rather than transmitted, because a projection that fails to
 *    parse means the tool and its declared contract have drifted, and the only
 *    safe reading of that is "do not send this".
 *
 * Rule 3 is the one that carries D-CS-02. Results on this channel *do* go back
 * to the model for reply composition, which is only safe while the payload
 * class is non-sensitive by construction — and this is where that stops being
 * an intention.
 */
@Injectable()
export class CsToolRegistry {
  private readonly toolsByName = new Map<CsToolNameValue, CsTool>();

  registerTool(tool: CsTool): void {
    if (this.toolsByName.has(tool.name)) {
      throw new Error(`Customer-service tool is already registered: ${tool.name}`);
    }
    this.toolsByName.set(tool.name, tool);
  }

  /**
   * The catalogue, in registration order. Empty means the provider request
   * carries no `tools` field at all — which is exactly what `PCS-T06` shipped,
   * so a deployment that fails to register them degrades to that rather than
   * to an error.
   */
  listTools(): CsTool[] {
    return [...this.toolsByName.values()];
  }

  /**
   * Executes one model-requested call.
   *
   * Throws a typed {@link CustomerServiceError} for every refusal so the
   * caller can record a failed lookup in the transcript and carry on — one bad
   * call must not cost the customer their reply.
   */
  async dispatchTool(request: CsToolDispatchRequest): Promise<CsToolDispatchOutcome> {
    const tool = this.findTool(request.toolName);
    if (tool === null) {
      throw new CustomerServiceError(
        'CS_TOOL_UNKNOWN',
        `Tool is not available on this channel: ${request.toolName}`,
      );
    }
    const parsedArguments = tool.argumentSchema.safeParse(request.arguments);
    if (!parsedArguments.success) {
      throw new CustomerServiceError(
        'CS_TOOL_INVALID_ARGUMENTS',
        `Arguments rejected for tool: ${tool.name}`,
      );
    }
    const execution = await tool.execute(request.context, parsedArguments.data);
    const projected = tool.resultSchema.safeParse(execution.result);
    if (!projected.success) {
      throw new CustomerServiceError(
        'CS_TOOL_RESULT_REJECTED',
        `Tool result did not match its declared output contract: ${tool.name}`,
      );
    }
    return {
      toolName: tool.name,
      validatedArguments: parsedArguments.data,
      result: projected.data,
      ...(execution.deterministicReply === undefined
        ? {}
        : { deterministicReply: execution.deterministicReply }),
      ...(execution.pausesConversation === undefined
        ? {}
        : { pausesConversation: execution.pausesConversation }),
      ...(execution.requestContact === undefined
        ? {}
        : { requestContact: execution.requestContact }),
    };
  }

  private findTool(toolName: string): CsTool | null {
    return this.toolsByName.get(toolName as CsToolNameValue) ?? null;
  }
}
