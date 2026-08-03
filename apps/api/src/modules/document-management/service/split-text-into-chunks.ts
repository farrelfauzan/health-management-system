import { SplitTextIntoChunksParams } from '@hms/shared-types';

const PARAGRAPH_BOUNDARY_PATTERN = /\n{2,}/;
const SENTENCE_BOUNDARY_PATTERN = /(?<=[.!?])\s+/;
const PARAGRAPH_SEPARATOR = '\n\n';
const SENTENCE_SEPARATOR = ' ';

/**
 * Splits a document's text into overlapping passages for embedding.
 *
 * The unit of retrieval is the chunk, so where the cuts fall decides what an
 * answer can cite. Paragraphs are preferred over a fixed window because a
 * clinic SOP's meaning lives in its steps, and a window that ends mid-step
 * embeds half a procedure — a passage that matches the question and answers
 * only part of it, which is worse than not matching at all.
 *
 * Chunks overlap by `overlapCharacters` so a fact stated across a boundary is
 * present whole in at least one of them. The overlap is cut at a whitespace
 * boundary: half a word carries no meaning into the vector and pollutes the
 * lexical index with a token that appears nowhere in the document.
 *
 * Sizes are characters rather than tokens deliberately. A real tokenizer
 * would be a second dependency that must stay in step with the embedding
 * model, and the budget is approximate either way — roughly four characters
 * per token for both Indonesian and English.
 */
export function splitTextIntoChunks(params: SplitTextIntoChunksParams): string[] {
  assertUsableSizes(params);
  const segments = buildSegments(normalizeText(params.text), params.maxCharacters);
  const chunks: string[] = [];
  let current = '';
  for (const segment of segments) {
    const candidate =
      current === '' ? segment.text : `${current}${segment.separator}${segment.text}`;
    if (candidate.length <= params.maxCharacters) {
      current = candidate;
      continue;
    }
    if (current !== '') {
      chunks.push(current);
    }
    const overlap = buildOverlap(current, params.overlapCharacters);
    current = overlap === '' ? segment.text : `${overlap}${segment.separator}${segment.text}`;
  }
  if (current.trim() !== '') {
    chunks.push(current);
  }
  return chunks;
}

function assertUsableSizes(params: SplitTextIntoChunksParams): void {
  if (params.maxCharacters <= 0) {
    throw new Error('Chunk size must be a positive number of characters');
  }
  // Equal sizes would seed every chunk with a full chunk of overlap and the
  // loop would never make progress.
  if (params.overlapCharacters < 0 || params.overlapCharacters >= params.maxCharacters) {
    throw new Error('Chunk overlap must be smaller than the chunk size');
  }
}

function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

/**
 * Flattens the text into the smallest pieces worth keeping together, each
 * carrying the separator that should precede it. Paragraphs first; a
 * paragraph too large to ever fit is broken at sentence boundaries, and a
 * sentence too large for that is cut by length as a last resort.
 */
function buildSegments(
  text: string,
  maxCharacters: number,
): Array<{ text: string; separator: string }> {
  const segments: Array<{ text: string; separator: string }> = [];
  for (const paragraph of splitAndTrim(text, PARAGRAPH_BOUNDARY_PATTERN)) {
    if (paragraph.length <= maxCharacters) {
      segments.push({ text: paragraph, separator: PARAGRAPH_SEPARATOR });
      continue;
    }
    for (const sentence of splitAndTrim(paragraph, SENTENCE_BOUNDARY_PATTERN)) {
      const pieces =
        sentence.length <= maxCharacters ? [sentence] : splitByLength(sentence, maxCharacters);
      pieces.forEach((piece) => segments.push({ text: piece, separator: SENTENCE_SEPARATOR }));
    }
  }
  return segments;
}

function splitAndTrim(text: string, boundary: RegExp): string[] {
  return text
    .split(boundary)
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

function splitByLength(text: string, maxCharacters: number): string[] {
  const pieces: string[] = [];
  for (let index = 0; index < text.length; index += maxCharacters) {
    pieces.push(text.slice(index, index + maxCharacters));
  }
  return pieces;
}

/**
 * The tail of the previous chunk, trimmed forward to the next whitespace so
 * the overlap never begins mid-word.
 */
function buildOverlap(previousChunk: string, overlapCharacters: number): string {
  if (previousChunk === '' || overlapCharacters === 0) {
    return '';
  }
  const tail = previousChunk.slice(-overlapCharacters);
  const firstBoundary = tail.search(/\s/);
  return firstBoundary === -1 ? tail.trim() : tail.slice(firstBoundary).trim();
}
