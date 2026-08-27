const INVITE_PATH = '/invite';

/**
 * Builds the absolute link the invitee clicks.
 *
 * Its own file so that exactly one function decides what a raw invitation
 * token may be pasted into. The token is the credential — the moment more than
 * one place assembles a URL from it, one of them ends up putting it somewhere
 * it is logged.
 */
export function buildInvitationUrl(webAppBaseUrl: string, token: string): string {
  return `${webAppBaseUrl}${INVITE_PATH}/${encodeURIComponent(token)}`;
}
