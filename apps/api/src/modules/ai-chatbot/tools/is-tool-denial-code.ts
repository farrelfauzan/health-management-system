import { AiChatbotErrorCode } from '../infrastructure/ai-provider.types';

/**
 * Which tool failures are access decisions worth an audit row (SJ-14 §5).
 *
 * `AI_TOOL_UNAVAILABLE` is the registry refusing a tool the caller was never
 * offered — the shape a prompt injection takes when it works on the model but
 * not on us — and `AI_TOOL_PERMISSION_DENIED` is a domain service refusing the
 * row. Both are somebody being told no, and SJ-4's question is "who tried",
 * not "who succeeded".
 *
 * Invalid arguments and execution failures are excluded: they are a model that
 * cannot fill a schema and an infrastructure fault respectively, and filing
 * either as an access event would bury the real ones.
 */
export function isToolDenialCode(errorCode: AiChatbotErrorCode): boolean {
  return errorCode === 'AI_TOOL_UNAVAILABLE' || errorCode === 'AI_TOOL_PERMISSION_DENIED';
}
