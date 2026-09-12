import { buildNotionRichText } from './build-notion-rich-text';
import { NotionParagraphBlock } from './notion.types';

/** Notion accepts at most this many child blocks in one request. */
const MAX_CHILD_BLOCKS = 100;
const TRUNCATION_NOTICE = '[…] The rest of this report was too long for one Notion page.';

function buildParagraph(line: string): NotionParagraphBlock {
  return { object: 'block', type: 'paragraph', paragraph: { rich_text: buildNotionRichText(line) } };
}

/**
 * Turns a block of text into Notion paragraph blocks, one per line, capped at
 * the 100 children a single request may carry (P23-T03).
 *
 * Over the cap the text is truncated rather than split across follow-up
 * append calls: a second call is a second chance to half-create a page, and a
 * bug report that needs more than a hundred paragraphs has already said
 * everything a triager will read. The last block says so, so nobody mistakes a
 * truncated report for a complete one.
 */
export function buildNotionParagraphBlocks(text: string): NotionParagraphBlock[] {
  const lines = text.split('\n');
  if (lines.length <= MAX_CHILD_BLOCKS) {
    return lines.map(buildParagraph);
  }
  return [
    ...lines.slice(0, MAX_CHILD_BLOCKS - 1).map(buildParagraph),
    buildParagraph(TRUNCATION_NOTICE),
  ];
}
