import type { InlineSpan } from '#lib/ai-assistant/inline-span';

/**
 * The supported emphasis markers, longest first so `***teks***` is read as
 * bold-italic rather than as bold followed by a stray asterisk. Code is first
 * of all: its content is literal, and a backtick run must not be re-read for
 * emphasis inside it.
 *
 * Two guards keep ordinary text out of the parser's hands, both borrowed from
 * CommonMark's flanking rules:
 *
 * - the content may not begin or end with a space, so the arithmetic in
 *   "2 * 3 dan 4 * 5" is arithmetic rather than an italic run spanning it;
 * - an underscore marker may not touch a word character, so `snake_case_name`
 *   survives as itself.
 */
const INLINE_TOKEN = new RegExp(
  [
    '`[^`\\n]+`',
    '\\*\\*\\*(?:\\S|\\S[^*\\n]*\\S)\\*\\*\\*',
    '\\*\\*(?:\\S|\\S[^*\\n]*\\S)\\*\\*',
    '(?<!\\w)__(?:\\S|\\S[^_\\n]*\\S)__(?!\\w)',
    '\\*(?:\\S|\\S[^*\\n]*\\S)\\*',
    '(?<!\\w)_(?:\\S|\\S[^_\\n]*\\S)_(?!\\w)',
  ]
    .map((pattern) => `(?:${pattern})`)
    .join('|'),
  '',
);

/** The same alternation as a capturing group, which is what `split` needs. */
const INLINE_TOKEN_SPLIT = new RegExp(`(${INLINE_TOKEN.source})`);

function toSpan(token: string): InlineSpan {
  if (token.startsWith('`')) {
    return { text: token.slice(1, -1), isBold: false, isItalic: false, isCode: true };
  }
  if (token.startsWith('***')) {
    return { text: token.slice(3, -3), isBold: true, isItalic: true, isCode: false };
  }
  if (token.startsWith('**') || token.startsWith('__')) {
    return { text: token.slice(2, -2), isBold: true, isItalic: false, isCode: false };
  }
  return { text: token.slice(1, -1), isBold: false, isItalic: true, isCode: false };
}

/**
 * Resolves the emphasis markers a model writes into runs the thread can
 * style, so a reply reads as "**Dokter**" intends rather than as the four
 * asterisks it is made of.
 *
 * Anything that is not one of the supported markers survives verbatim,
 * including a lone asterisk or an unclosed pair: this is a renderer for what
 * the model got right, never a rewriter of what it got wrong.
 */
export function parseInlineMarkdown(text: string): InlineSpan[] {
  return text
    .split(INLINE_TOKEN_SPLIT)
    .filter((part) => part !== undefined && part.length > 0)
    .map((part) =>
      // Anchored: `split` hands back whole tokens and plain runs, and a plain
      // run that merely *contains* a marker must stay plain.
      new RegExp(`^(?:${INLINE_TOKEN.source})$`).test(part)
        ? toSpan(part)
        : { text: part, isBold: false, isItalic: false, isCode: false },
    );
}
