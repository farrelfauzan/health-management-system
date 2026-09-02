/**
 * How a visit link travels through a `<Select>`, which can hold one string.
 *
 * `encounter:<id>` or `admission:<id>`, or the `NONE` sentinel for a general
 * document that arose from no visit. The prefix carries the kind, so the
 * dialog can hand the API exactly one of `encounterId` / `admissionId` —
 * which is what the schema's "one episode, not both" rule requires — without
 * a second control to say which kind the id is.
 */
export const VISIT_LINK_NONE = 'NONE';
