import { sanitizeChatMarkup } from './sanitize-chat-markup';

/**
 * Well under the schema's 200-character cap: a session title is a sidebar row,
 * and a title the layout has to truncate was never a title.
 */
const SESSION_TITLE_MAX_LENGTH = 80;

/** "Title:", "Judul -", "Topik:" — models label their answer despite being told not to. */
const LEADING_LABEL = /^(title|judul|topik|topic|subject)\s*[:\-–—]\s*/i;

/** Wrapping quotes, markdown emphasis, and the trailing full stop a title never needs. */
const DECORATIVE_EDGES = /^["'“”‘’`*_\s]+|["'“”‘’`*_\s.,;:]+$/g;

const WHITESPACE_RUN = /\s+/g;

/**
 * Paragraph break, not line break. A model that adds its reasoning puts it
 * after a blank line, while a user's wrapped question is one paragraph across
 * several lines — splitting on every newline would keep the first line of the
 * question and throw the rest of it away.
 */
const PARAGRAPH_BREAK = /\n\s*\n/;

/**
 * Turns arbitrary text into a storable session title, or null when nothing
 * usable survives.
 *
 * Used for both sources a title can come from — the model's summary and, when
 * that call fails, the user's own first message — because the cleanup is the
 * same job either way: one paragraph, no markup, no decoration, bounded
 * length.
 *
 * The model output is treated as untrusted text, not as a title: it reaches
 * the sidebar of every future session list, so it goes through the same markup
 * stripping as a chat reply before anything else happens to it.
 */
export function normalizeChatSessionTitle(value: string): string | null {
  const firstParagraph = sanitizeChatMarkup(value).content.split(PARAGRAPH_BREAK)[0] ?? '';
  const collapsed = firstParagraph
    .replace(WHITESPACE_RUN, ' ')
    .replace(LEADING_LABEL, '')
    .replace(DECORATIVE_EDGES, '');
  if (collapsed.length === 0) {
    return null;
  }
  if (collapsed.length <= SESSION_TITLE_MAX_LENGTH) {
    return collapsed;
  }
  return `${collapsed.slice(0, SESSION_TITLE_MAX_LENGTH - 1).trimEnd()}…`;
}
