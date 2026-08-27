import { buildInvitationUrl } from './build-invitation-url';

describe('buildInvitationUrl', () => {
  it('appends the invite path and token to the web origin', () => {
    const actualUrl = buildInvitationUrl('https://klinik.example', 'abc123');

    expect(actualUrl).toBe('https://klinik.example/invite/abc123');
  });

  // base64url is URL-safe by construction, so this is belt and braces — but the
  // token is the credential, and a mangled one produces a 404 the invitee has
  // no way to diagnose.
  it('percent-encodes a token containing reserved characters', () => {
    const actualUrl = buildInvitationUrl('https://klinik.example', 'a/b?c#d');

    expect(actualUrl).toBe('https://klinik.example/invite/a%2Fb%3Fc%23d');
  });
});
