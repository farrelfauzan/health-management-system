import { AxiosError, type AxiosResponse } from 'axios';
import { describe, expect, it } from 'vitest';

import { resolveInvitationLinkMessageKey } from './resolve-invitation-link-message-key';

function buildAxiosError(status: number): AxiosError {
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    statusText: '',
    headers: {},
    config: {},
    data: {},
  } as AxiosResponse);
}

describe('resolveInvitationLinkMessageKey', () => {
  it.each([
    [404, 'invalidLink'],
    [409, 'alreadyUsed'],
    [410, 'noLongerValid'],
  ])('maps %i to the %s copy', (inputStatus, expectedKey) => {
    expect(resolveInvitationLinkMessageKey(buildAxiosError(inputStatus))).toBe(expectedKey);
  });

  // A rejected password is specific and actionable; flattening it into "this
  // link is not valid" would send the invitee looking for a new email they do
  // not need.
  it('defers to the API message for a rejected password', () => {
    expect(resolveInvitationLinkMessageKey(buildAxiosError(400))).toBeNull();
  });

  it('defers for a non-HTTP failure', () => {
    expect(resolveInvitationLinkMessageKey(new Error('offline'))).toBeNull();
  });
});
