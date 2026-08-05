import type { MarkdownBlock } from '#lib/ai-assistant/markdown-block';

const HEADING_LINE = /^#{1,6}\s+(.*)$/;
const BULLET_LINE = /^\s*[-*•]\s+(.*)$/;
const NUMBERED_LINE = /^\s*\d+[.)]\s+(.*)$/;

function toItems(lines: string[], pattern: RegExp): string[] {
  return lines.map((line) => pattern.exec(line)?.[1]?.trim() ?? line.trim());
}

/**
 * Classifies one blank-line-separated chunk of an assistant reply.
 *
 * A chunk is a list only when **every** line in it is a list item. A single
 * "1." inside a prose paragraph is a sentence, not an ordered list, and
 * promoting it would re-flow the reply into a shape the model did not write —
 * the failure mode of every over-eager markdown renderer.
 */
export function parseMarkdownBlock(chunk: string): MarkdownBlock {
  const lines = chunk
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
  const headingMatch = lines.length === 1 ? HEADING_LINE.exec(lines[0] ?? '') : null;
  if (headingMatch !== null) {
    return { kind: 'HEADING', text: headingMatch[1]?.trim() ?? '' };
  }
  if (lines.length > 0 && lines.every((line) => BULLET_LINE.test(line))) {
    return { kind: 'BULLETS', items: toItems(lines, BULLET_LINE) };
  }
  if (lines.length > 0 && lines.every((line) => NUMBERED_LINE.test(line))) {
    return { kind: 'NUMBERS', items: toItems(lines, NUMBERED_LINE) };
  }
  return { kind: 'PARAGRAPH', lines };
}
