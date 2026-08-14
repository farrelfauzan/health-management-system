import { ForbiddenException } from '@nestjs/common';

import { AiChatbotError } from '../ai-chatbot.error';
import { AiChatbotErrorCode } from '../infrastructure/ai-provider.types';

/**
 * Names what a failed tool call actually was (SJ-14 §5).
 *
 * The registry raises its own typed codes and they pass through unchanged.
 * The interesting case is the domain's `ForbiddenException`: a tool executes
 * as the asking user, so a service refusing them is the authorization system
 * working, not the lookup breaking. Collapsing it into
 * `AI_TOOL_EXECUTION_FAILED` — as this loop did before — left a doctor
 * reaching for an unassigned patient looking exactly like a database outage,
 * which is both the wrong thing to tell the user and the wrong thing to leave
 * in the transcript.
 *
 * Everything else stays `AI_TOOL_EXECUTION_FAILED`. A `NotFoundException` is
 * deliberately not treated as a denial even though some services 404 rather
 * than 403 to avoid confirming a record exists: guessing at that here would
 * file genuine missing rows as security events.
 */
export function resolveToolFailureCode(caughtError: unknown): AiChatbotErrorCode {
  if (caughtError instanceof AiChatbotError) {
    return caughtError.code;
  }
  if (caughtError instanceof ForbiddenException) {
    return 'AI_TOOL_PERMISSION_DENIED';
  }
  return 'AI_TOOL_EXECUTION_FAILED';
}
