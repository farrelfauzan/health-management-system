import { isAxiosError } from 'axios';

/**
 * The `authShell.invite` keys this resolver may return. A literal union rather
 * than `string` so `next-intl`'s typed catalog still checks the lookup — a key
 * renamed in the message files has to fail here, not at runtime on the one
 * page nobody is signed in to.
 */
export type InvitationLinkMessageKey = 'invalidLink' | 'alreadyUsed' | 'noLongerValid';

const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_GONE = 410;

/**
 * Maps a refusal about the *link itself* to an i18n key, or null when the
 * failure is about something else.
 *
 * The API answers in English, like every other endpoint in this codebase, and
 * everywhere else that is fine because a staff member is reading it inside a
 * shell that already told them what they were doing. The accept page is the
 * one exception: it is public, it is the invitee's first contact with the
 * clinic's software, and the surrounding copy is Bahasa Indonesia — so for the
 * three ways a link stops working, the status code is what gets translated.
 *
 * `409` and `410` are kept apart because the advice differs: an already-used
 * invitation means "go and log in", a withdrawn or lapsed one means "ask for
 * another".
 *
 * Anything else — a rejected password, most of all — returns null so the
 * caller falls back to the API's own message. That one is specific, actionable
 * and would be destroyed by being flattened into "this link is not valid".
 */
export function resolveInvitationLinkMessageKey(error: unknown): InvitationLinkMessageKey | null {
  if (!isAxiosError(error)) {
    return null;
  }
  switch (error.response?.status) {
    case HTTP_CONFLICT:
      return 'alreadyUsed';
    case HTTP_GONE:
      return 'noLongerValid';
    case HTTP_NOT_FOUND:
      return 'invalidLink';
    default:
      return null;
  }
}
