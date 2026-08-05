/**
 * A run of assistant text with its emphasis resolved. Deliberately flags
 * rather than nested nodes: the supported subset is bold, italic, and inline
 * code, and a flat list of runs is all that is needed to render it — while a
 * tree would invite the arbitrary nesting this renderer exists to avoid.
 */
export type InlineSpan = {
  text: string;
  isBold: boolean;
  isItalic: boolean;
  isCode: boolean;
};
