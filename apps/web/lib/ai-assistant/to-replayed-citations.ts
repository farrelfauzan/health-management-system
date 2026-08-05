import type { ChatCitationView } from '@hms/shared-types';

const SOURCE_TIERS: readonly string[] = ['CLINIC', 'PERSONAL'];

/**
 * Recovers the citations of a grounded exchange from its stored retrieval
 * `SYSTEM` turn, so a reopened consultation shows what the answer was allowed
 * to draw on — and, since `P15-T22`, whether each source was clinic policy or
 * the reader's own document.
 *
 * **Nothing new is persisted for this.** The retrieval turn already stores
 * `JSON.stringify({ promptBlock, citations })`: the passages were recorded
 * before transmission as the UU PDP audit record, and the citations rode along
 * in the same object. Replay simply never looked at them —
 * `toReplayedToolResult` returns `null` for this shape, so the turn was
 * silently dropped.
 *
 * `SYSTEM` turns carry three different payloads — the context snapshot, one
 * per executed tool call, and this. They are told apart by shape rather than
 * by a marker column, so the discriminator here has to be one no other payload
 * has: `promptBlock` alongside a `citations` array. A tool turn carries
 * `toolName` and `outcome` and matches nothing below.
 */
export function toReplayedCitations(content: string): ChatCitationView[] | null {
  const candidate = readJsonObject(content);
  if (candidate === null || typeof candidate.promptBlock !== 'string') {
    return null;
  }
  const citations = candidate.citations;
  if (!Array.isArray(citations) || citations.length === 0) {
    return null;
  }
  const parsed = citations.filter(isCitation);
  return parsed.length === 0 ? null : parsed;
}

/**
 * A row is kept only if every field the renderer reads is present and of the
 * right type. A transcript is long-lived and the shape it was written under
 * may not be the shape the app now expects, so a malformed entry is dropped
 * rather than rendered as a citation with blank fields — an empty label next
 * to a document title would read as "source unknown", which is worse than the
 * citation simply not appearing.
 */
function isCitation(value: unknown): value is ChatCitationView {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.reference === 'number' &&
    typeof candidate.documentId === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.sourceTier === 'string' &&
    SOURCE_TIERS.includes(candidate.sourceTier)
  );
}

function readJsonObject(content: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(content);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
