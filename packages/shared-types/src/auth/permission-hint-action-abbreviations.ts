/**
 * The six commonest actions in the catalogue, written as one letter in the
 * session-hint cookie (P29-T01). Between them they appear about 125 times in
 * SUPER_ADMIN's catalogue-wide hint, so abbreviating them saves ~650 cookie
 * bytes: the room the analytics keys needed, and more for what comes next.
 *
 * Safe because no real action is a single letter (the codec spec asserts it
 * against `seed.sql`), so a letter can only ever be an abbreviation, and a
 * hint written before this existed — full words throughout — still decodes.
 */
export const PERMISSION_HINT_ACTION_ABBREVIATIONS: Readonly<Record<string, string>> = {
  read: 'r',
  write: 'w',
  create: 'c',
  update: 'u',
  delete: 'd',
  manage: 'm',
};
