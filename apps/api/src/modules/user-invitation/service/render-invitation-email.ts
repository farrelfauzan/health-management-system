import { InvitationEmailPayload } from '@hms/shared-types';

import { RenderedMail } from '../../../common/mail/mail.types';

const CLINIC_LABEL = 'Saling Jaga';

/**
 * Renders the invitation email.
 *
 * Bahasa Indonesia first with English underneath, the same bilingual shape as
 * `CS_REPLY_TEMPLATES` and for the same reason: the clinic's staff write in
 * Indonesian, and a bilingual template needs no language detection to be
 * right for the minority who do not.
 *
 * The copy states the expiry and says the link is single-use, because the two
 * ways this flow fails for an ordinary person are opening it a week late and
 * clicking the link in an older email after a resend. It names the inviter
 * where one is known — an unexpected "set your password" link is
 * indistinguishable from a phishing attempt without it — and it tells someone
 * who was not expecting an invitation to ignore it rather than to click
 * anything.
 *
 * The HTML is a single inlined-style table-free block: mail clients strip
 * stylesheets, and this message has one job that a paragraph and a link do.
 */
export function renderInvitationEmail(payload: InvitationEmailPayload): RenderedMail {
  const expiryLabel = formatExpiry(payload.expiresAt);
  const inviterLineId = payload.invitedByEmail
    ? `Undangan ini dikirim oleh ${payload.invitedByEmail}.`
    : 'Undangan ini dikirim oleh administrator klinik.';
  const inviterLineEn = payload.invitedByEmail
    ? `This invitation was sent by ${payload.invitedByEmail}.`
    : 'This invitation was sent by a clinic administrator.';
  return {
    subject: `Undangan akun ${CLINIC_LABEL} / Your ${CLINIC_LABEL} account invitation`,
    text: [
      `Halo,`,
      `Anda diundang untuk membuat akun staf ${CLINIC_LABEL}. ${inviterLineId}`,
      `Buka tautan berikut untuk menentukan kata sandi Anda:`,
      payload.invitationUrl,
      `Tautan ini hanya dapat dipakai satu kali dan berlaku sampai ${expiryLabel}.`,
      `Jika Anda tidak mengharapkan undangan ini, abaikan email ini — tidak ada akun yang aktif sampai kata sandi dibuat.`,
      `---`,
      `Hello,`,
      `You have been invited to create a ${CLINIC_LABEL} staff account. ${inviterLineEn}`,
      `Open the link below to choose your password:`,
      payload.invitationUrl,
      `The link works once and expires on ${expiryLabel}.`,
      `If you were not expecting this invitation, ignore this email — no account is active until a password is set.`,
    ].join('\n\n'),
    html: buildHtml({
      invitationUrl: payload.invitationUrl,
      expiryLabel,
      inviterLineId,
      inviterLineEn,
    }),
  };
}

function formatExpiry(expiresAt: Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(expiresAt);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildHtml(input: {
  readonly invitationUrl: string;
  readonly expiryLabel: string;
  readonly inviterLineId: string;
  readonly inviterLineEn: string;
}): string {
  const safeUrl = escapeHtml(input.invitationUrl);
  const safeExpiry = escapeHtml(input.expiryLabel);
  return [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.6;color:#111827">',
    '<p>Halo,</p>',
    `<p>Anda diundang untuk membuat akun staf ${CLINIC_LABEL}. ${escapeHtml(input.inviterLineId)}</p>`,
    `<p><a href="${safeUrl}" style="display:inline-block;padding:10px 18px;background:#0f766e;color:#ffffff;border-radius:6px;text-decoration:none">Tentukan kata sandi / Set your password</a></p>`,
    `<p style="font-size:13px;color:#6b7280">${safeUrl}</p>`,
    `<p>Tautan ini hanya dapat dipakai satu kali dan berlaku sampai ${safeExpiry}. Jika Anda tidak mengharapkan undangan ini, abaikan email ini.</p>`,
    '<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0" />',
    '<p>Hello,</p>',
    `<p>You have been invited to create a ${CLINIC_LABEL} staff account. ${escapeHtml(input.inviterLineEn)}</p>`,
    `<p>The link works once and expires on ${safeExpiry}. If you were not expecting this invitation, ignore this email — no account is active until a password is set.</p>`,
    '</div>',
  ].join('');
}
