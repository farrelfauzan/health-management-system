/**
 * Well under the API's 200-character cap: this is a sidebar row, and a title
 * that has to be truncated by CSS anyway was never a title.
 */
const SESSION_TITLE_MAX_LENGTH = 80;

/**
 * Names a session after the question that started it.
 *
 * The API accepts a `title` at creation but never derives one, and the client
 * was not sending it — which is why every consultation in the history list
 * read "untitled". The first user message is the only thing available at
 * creation time that describes the conversation, and it is what the user
 * would have typed as a title anyway.
 *
 * Returns undefined for an empty message so the field is omitted rather than
 * sent as a blank string the schema would reject.
 */
export function buildSessionTitle(firstMessage: string): string | undefined {
  const collapsed = firstMessage.trim().replace(/\s+/g, ' ');
  if (collapsed.length === 0) {
    return undefined;
  }
  if (collapsed.length <= SESSION_TITLE_MAX_LENGTH) {
    return collapsed;
  }
  return `${collapsed.slice(0, SESSION_TITLE_MAX_LENGTH - 1).trimEnd()}…`;
}
