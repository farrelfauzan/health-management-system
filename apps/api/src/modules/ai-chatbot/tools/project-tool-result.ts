import { ChatToolResultSchema } from '@hms/shared-types';

import { AiChatbotError } from '../ai-chatbot.error';

/**
 * The §4.3 output allowlist, applied. A tool builds its result field by field
 * from the backing service's response and hands it here; a field the schema
 * does not name is stripped, and a shape that does not match at all is
 * refused rather than transmitted.
 *
 * Refusing is the point. A projection that fails to parse means the tool and
 * its declared contract have drifted apart, and the only safe reading of that
 * is "do not send this" — the caller turns the thrown error into a FAILED
 * lookup (§4.5), which renders as a failed lookup instead of as unvalidated
 * clinic data. Fails closed, like the ability filter above it.
 */
export function projectToolResult<TResult>(
  schema: ChatToolResultSchema<TResult>,
  candidate: unknown,
): TResult {
  const projected = schema.safeParse(candidate);
  if (!projected.success) {
    throw new AiChatbotError(
      'AI_TOOL_EXECUTION_FAILED',
      'Tool result did not match its declared output contract',
    );
  }
  return projected.data;
}
