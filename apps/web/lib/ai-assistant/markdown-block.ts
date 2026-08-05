/**
 * One block of an assistant reply. The four kinds are the whole grammar this
 * client renders — everything else in a model's markdown stays literal text,
 * which is the point: an allowlist cannot be widened by what a provider sends.
 *
 * Notably absent are links and images. The API already strips HTML from every
 * reply (`sanitizeChatMarkup`), and rendering a model-authored URL as a
 * clickable target would put that back — a chat surface answering clinic
 * questions has no reason to navigate anywhere the model chooses.
 */
export type MarkdownBlock =
  | { kind: 'HEADING'; text: string }
  | { kind: 'PARAGRAPH'; lines: string[] }
  | { kind: 'BULLETS'; items: string[] }
  | { kind: 'NUMBERS'; items: string[] };
