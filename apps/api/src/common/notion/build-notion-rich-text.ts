import { NotionRichText } from './notion.types';

/** Notion rejects any rich-text object longer than this. */
const MAX_RICH_TEXT_LENGTH = 2000;

/**
 * Splits at grapheme boundaries where the runtime can, so a chunk never ends
 * between the halves of a surrogate pair or inside an emoji sequence — a split
 * emoji reaches Notion as two replacement characters and looks like data
 * corruption in a bug report.
 */
function splitIntoGraphemes(text: string): string[] {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  return [...segmenter.segment(text)].map((segment) => segment.segment);
}

/**
 * Builds Notion rich-text objects from a plain string, splitting at the
 * 2,000-character limit the API enforces per object (P23-T03).
 *
 * Length is counted in UTF-16 code units, the unit Notion counts in, so a
 * chunk of astral characters stays under the limit rather than merely under
 * 2,000 graphemes.
 *
 * An empty string yields no objects: Notion refuses an empty rich-text array
 * element, and a caller with nothing to say should send nothing.
 */
export function buildNotionRichText(text: string): NotionRichText[] {
  if (text === '') {
    return [];
  }
  const chunks: string[] = [];
  let currentChunk = '';
  for (const grapheme of splitIntoGraphemes(text)) {
    if (currentChunk.length + grapheme.length > MAX_RICH_TEXT_LENGTH && currentChunk !== '') {
      chunks.push(currentChunk);
      currentChunk = '';
    }
    currentChunk += grapheme;
  }
  chunks.push(currentChunk);
  return chunks.map((content) => ({ type: 'text', text: { content } }));
}
