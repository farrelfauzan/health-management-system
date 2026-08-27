import { renderInvitationEmail } from './render-invitation-email';

describe('renderInvitationEmail', () => {
  const basePayload = {
    recipientEmail: 'siti@example.com',
    invitationUrl: 'https://klinik.example/invite/token-value',
    expiresAt: new Date('2026-08-29T04:00:00.000Z'),
    invitedByEmail: 'admin@klinik.example',
  };

  it('puts the invitation link in both the text and the HTML body', () => {
    const actualMail = renderInvitationEmail(basePayload);

    expect(actualMail.text).toContain(basePayload.invitationUrl);
    expect(actualMail.html).toContain(basePayload.invitationUrl);
  });

  // An unexpected "set your password" link is indistinguishable from phishing
  // without a name on it.
  it('names the inviter when one is known', () => {
    const actualMail = renderInvitationEmail(basePayload);

    expect(actualMail.text).toContain('admin@klinik.example');
  });

  it('falls back to a generic sender line when the inviter is unknown', () => {
    const actualMail = renderInvitationEmail({ ...basePayload, invitedByEmail: null });

    expect(actualMail.text).toContain('administrator klinik');
    expect(actualMail.text).toContain('clinic administrator');
  });

  it('is bilingual, Indonesian first', () => {
    const actualMail = renderInvitationEmail(basePayload);

    expect(actualMail.text.indexOf('Halo,')).toBeLessThan(actualMail.text.indexOf('Hello,'));
    expect(actualMail.subject).toContain('Undangan akun');
  });

  it('escapes HTML-significant characters rather than emitting them raw', () => {
    const actualMail = renderInvitationEmail({
      ...basePayload,
      invitedByEmail: '<script>alert(1)</script>',
    });

    expect(actualMail.html).not.toContain('<script>');
    expect(actualMail.html).toContain('&lt;script&gt;');
  });
});
