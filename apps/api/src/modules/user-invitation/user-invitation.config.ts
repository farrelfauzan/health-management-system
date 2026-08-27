import { ConfigService } from '@nestjs/config';

import { UserInvitationConfig } from './user-invitation.types';

const DEFAULT_WEB_APP_BASE_URL = 'http://localhost:3000';
const DEFAULT_TTL_HOURS = 72;
const MAX_TTL_HOURS = 24 * 14;

function normaliseBaseUrl(value: string): string {
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return withScheme.replace(/\/+$/, '');
}

function readTtlHours(configService: ConfigService): number {
  const rawValue = configService.get<string>('USER_INVITATION_TTL_HOURS')?.trim() ?? '';
  if (rawValue === '') {
    return DEFAULT_TTL_HOURS;
  }
  const parsed = Number(rawValue);
  const isUsable = Number.isInteger(parsed) && parsed > 0 && parsed <= MAX_TTL_HOURS;
  return isUsable ? parsed : DEFAULT_TTL_HOURS;
}

/**
 * Where invitation links point, and how long they live.
 *
 * The base URL is the *web* origin, not the API's — the link lands on a
 * Next.js page that then calls the API — so it cannot be derived from the
 * request that created the invitation. A trailing slash or a missing scheme is
 * normalised rather than rejected: both are reasonable things to paste, and
 * neither changes which deployment is meant.
 *
 * Seventy-two hours by default. Long enough to survive a weekend and a missed
 * inbox, short enough that a link forwarded, archived, or left in a mailbox
 * that later changes hands is dead before it is interesting. An administrator
 * who needs longer resends, which is one click and leaves a trail, rather than
 * widening this for everyone.
 */
export function resolveUserInvitationConfig(configService: ConfigService): UserInvitationConfig {
  const configured = configService.get<string>('WEB_APP_BASE_URL')?.trim() ?? '';
  return {
    webAppBaseUrl: normaliseBaseUrl(configured === '' ? DEFAULT_WEB_APP_BASE_URL : configured),
    ttlHours: readTtlHours(configService),
  };
}
