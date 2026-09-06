import { DocumentTemplateDiffSegment } from '@hms/shared-types';

/**
 * Block boundaries, opening **and** closing. Splitting on these is what turns
 * one long line of serialised HTML into something a person can read a diff of
 * — the editor emits no newlines, so without it every change would report as
 * "the whole template changed".
 *
 * Closers get their own blocks rather than trailing the content before them.
 * Otherwise a row inserted before `</table>` would rewrite the last block on
 * both sides and report as a change to the row above it, which is exactly the
 * kind of noise that teaches an approver to stop reading the diff.
 */
const BLOCK_TAG_PATTERN = /(?=<\/?(?:p|div|table|thead|tbody|tr|td|th|h[1-6]|ul|ol|li|br|hr)\b)/gi;

/**
 * A block-level diff of two template layouts (`P16-T32`, FR-E5-22).
 *
 * The point is "what changed", not a byte-exact patch: an approver comparing
 * a submission against the version currently in use needs to see which rows,
 * headings and cells moved, and a character diff of minified HTML would tell
 * them nothing. So the markup is split at block boundaries, whitespace is
 * collapsed, and the blocks are matched by a longest-common-subsequence pass.
 *
 * Whitespace-only differences are deliberately invisible here. The editor
 * re-serialises on every save, and a diff that lit up because indentation
 * changed would train approvers to skim past the diff that matters.
 */
export function buildTemplateHtmlDiff(
  baseHtml: string,
  submittedHtml: string,
): DocumentTemplateDiffSegment[] {
  const base = toBlocks(baseHtml);
  const submitted = toBlocks(submittedHtml);
  const lengths = buildCommonLengths(base, submitted);
  const segments: DocumentTemplateDiffSegment[] = [];
  let i = 0;
  let j = 0;
  while (i < base.length && j < submitted.length) {
    const left = base[i] as string;
    const right = submitted[j] as string;
    if (left === right) {
      segments.push({ kind: 'UNCHANGED', text: left });
      i += 1;
      j += 1;
    } else if (commonLength(lengths, i + 1, j) >= commonLength(lengths, i, j + 1)) {
      segments.push({ kind: 'REMOVED', text: left });
      i += 1;
    } else {
      segments.push({ kind: 'ADDED', text: right });
      j += 1;
    }
  }
  for (; i < base.length; i += 1) {
    segments.push({ kind: 'REMOVED', text: base[i] as string });
  }
  for (; j < submitted.length; j += 1) {
    segments.push({ kind: 'ADDED', text: submitted[j] as string });
  }
  return segments;
}

/** Block boundaries, whitespace collapsed, empties dropped. */
function toBlocks(html: string): string[] {
  return html
    .split(BLOCK_TAG_PATTERN)
    .map((block) => block.replace(/\s+/g, ' ').trim())
    .filter((block) => block !== '');
}

/**
 * `lengths[i][j]` is the longest common subsequence of the two suffixes
 * starting at `i` and `j`. The classic quadratic table: templates are
 * page-sized — tens of blocks, not thousands — so the simple version is the
 * right trade against a diff library whose behaviour on HTML nobody here
 * would have read.
 */
function buildCommonLengths(left: readonly string[], right: readonly string[]): number[][] {
  const lengths: number[][] = Array.from({ length: left.length + 1 }, () =>
    new Array<number>(right.length + 1).fill(0),
  );
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      const row = lengths[i] as number[];
      row[j] =
        left[i] === right[j]
          ? commonLength(lengths, i + 1, j + 1) + 1
          : Math.max(commonLength(lengths, i + 1, j), commonLength(lengths, i, j + 1));
    }
  }
  return lengths;
}

function commonLength(lengths: readonly number[][], i: number, j: number): number {
  return lengths[i]?.[j] ?? 0;
}
