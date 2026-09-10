import {
  TruncateDocumentPreviewTextParams,
  TruncateDocumentPreviewTextResult,
} from '@hms/shared-types';

/**
 * How far back the cut may walk to land on whitespace: the last run of
 * non-whitespace before the end of the hard cut, up to this many characters.
 * Past it the text has no break to find — one very long line — and the hard
 * cut is the honest answer.
 */
const TRAILING_WORD_PATTERN = /\s\S{0,200}$/u;

/**
 * Cuts a preview down to its cap and says so (`P19-T18`).
 *
 * Two decisions worth naming:
 *
 *   * **The counts are characters, not bytes.** What the cap protects is a
 *     reader and a page, and a page is filled by characters; counting bytes
 *     would truncate an Indonesian document holding accented text earlier
 *     than an English one of the same length for no reason a reader could see.
 *   * **The cut backs off to whitespace.** Slicing mid-word reads as a
 *     corrupted document rather than a truncated one, and an approver
 *     deciding whether they have read enough should not have to wonder which
 *     it is. The lookback is bounded so an unbroken line still gets cut.
 *
 * `isTruncated` is never left for a caller to infer from the lengths: a
 * document sitting exactly on the cap is complete, and this is the only place
 * that knows it.
 */
export function truncateDocumentPreviewText(
  params: TruncateDocumentPreviewTextParams,
): TruncateDocumentPreviewTextResult {
  const characters = [...params.text];
  const totalCharacterCount = characters.length;
  if (totalCharacterCount <= params.limit) {
    return {
      text: params.text,
      characterCount: totalCharacterCount,
      totalCharacterCount,
      isTruncated: false,
    };
  }
  const text = trimToWordBoundary(characters.slice(0, params.limit).join(''));
  return {
    text,
    characterCount: [...text].length,
    totalCharacterCount,
    isTruncated: true,
  };
}

function trimToWordBoundary(hardCut: string): string {
  const boundaryIndex = hardCut.search(TRAILING_WORD_PATTERN);
  if (boundaryIndex <= 0) {
    return hardCut.trimEnd();
  }
  return hardCut.slice(0, boundaryIndex).trimEnd();
}
