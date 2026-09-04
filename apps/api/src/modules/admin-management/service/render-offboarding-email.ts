import { OffboardingEmailPayload } from '@hms/shared-types';

import { RenderedMail } from '../../../common/mail/mail.types';

const CLINIC_LABEL = 'Saling Jaga';

/**
 * Renders the two offboarding emails (`P16-T41`, FR-E3-27): the one sent the
 * day a person is offboarded and the one sent with seven days left. Same
 * content both times, by design — the second exists because the first may
 * have been read in a hurry, not to say something new.
 *
 * It goes by email because a bell nobody opens is not a warning (§7.3.10.1):
 * someone who has resigned may never open the portal again. So the message
 * has to carry everything on its own: **the date**, **what will be deleted**
 * (their unshared documents, by count), **what will survive** (the ones they
 * shared, by count, readable by the people they shared them with), and
 * **how to act** — sign in, export, or delete now. It does not say what the
 * documents are called; an email is forwarded, and a person's paperwork is
 * theirs to name.
 *
 * Bahasa Indonesia first with English underneath, the shape every other
 * outbound message here takes.
 */
export function renderOffboardingEmail(payload: OffboardingEmailPayload): RenderedMail {
  const dateLabel = formatDeadline(payload.deadline);
  const { sharedDocumentCount, unsharedDocumentCount } = payload.summary;
  const openingId =
    payload.kind === 'DAY_ZERO'
      ? `Akun ${CLINIC_LABEL} Anda telah dinonaktifkan secara bertahap oleh administrator klinik.`
      : `Pengingat: masa akses dokumen Anda di ${CLINIC_LABEL} berakhir tujuh hari lagi.`;
  const openingEn =
    payload.kind === 'DAY_ZERO'
      ? `Your ${CLINIC_LABEL} account has been offboarded by a clinic administrator.`
      : `Reminder: your document access at ${CLINIC_LABEL} ends in seven days.`;
  return {
    subject: `Dokumen Anda akan dihapus pada ${dateLabel} / Your documents will be deleted on ${dateLabel}`,
    text: [
      `Halo,`,
      openingId,
      `Sampai ${dateLabel}, Anda masih dapat masuk untuk melihat, mengunduh, mengekspor, dan menghapus dokumen di Dokumen Saya — dan tidak ada yang lain.`,
      `Pada ${dateLabel}: ${unsharedDocumentCount} dokumen yang tidak Anda bagikan akan dihapus permanen. ${sharedDocumentCount} dokumen yang telah Anda bagikan tetap dapat dibuka oleh orang yang Anda bagikan.`,
      `Untuk menyimpan salinan atau menghapus lebih awal, buka:`,
      payload.vaultUrl,
      `---`,
      `Hello,`,
      openingEn,
      `Until ${dateLabel} you can still sign in to view, download, export and delete the documents in My Documents — and nothing else.`,
      `On ${dateLabel}: ${unsharedDocumentCount} document(s) you have not shared will be permanently deleted. ${sharedDocumentCount} document(s) you shared stay readable by the people you shared them with.`,
      `To keep a copy or delete them sooner, open:`,
      payload.vaultUrl,
    ].join('\n\n'),
    html: buildHtml({
      vaultUrl: payload.vaultUrl,
      dateLabel,
      openingId,
      openingEn,
      sharedDocumentCount,
      unsharedDocumentCount,
    }),
  };
}

function formatDeadline(deadline: Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'long',
    timeZone: 'Asia/Jakarta',
  }).format(deadline);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildHtml(input: {
  readonly vaultUrl: string;
  readonly dateLabel: string;
  readonly openingId: string;
  readonly openingEn: string;
  readonly sharedDocumentCount: number;
  readonly unsharedDocumentCount: number;
}): string {
  const safeUrl = escapeHtml(input.vaultUrl);
  const safeDate = escapeHtml(input.dateLabel);
  return [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.6;color:#111827">',
    '<p>Halo,</p>',
    `<p>${escapeHtml(input.openingId)}</p>`,
    `<p>Sampai <strong>${safeDate}</strong>, Anda masih dapat masuk untuk melihat, mengunduh, mengekspor, dan menghapus dokumen di Dokumen Saya — dan tidak ada yang lain.</p>`,
    `<p>Pada ${safeDate}: <strong>${input.unsharedDocumentCount}</strong> dokumen yang tidak Anda bagikan akan dihapus permanen. <strong>${input.sharedDocumentCount}</strong> dokumen yang telah Anda bagikan tetap dapat dibuka oleh orang yang Anda bagikan.</p>`,
    `<p><a href="${safeUrl}" style="display:inline-block;padding:10px 18px;background:#0f766e;color:#ffffff;border-radius:6px;text-decoration:none">Buka Dokumen Saya / Open My Documents</a></p>`,
    `<p style="font-size:13px;color:#6b7280">${safeUrl}</p>`,
    '<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0" />',
    '<p>Hello,</p>',
    `<p>${escapeHtml(input.openingEn)}</p>`,
    `<p>Until <strong>${safeDate}</strong> you can still sign in to view, download, export and delete the documents in My Documents — and nothing else.</p>`,
    `<p>On ${safeDate}: <strong>${input.unsharedDocumentCount}</strong> document(s) you have not shared will be permanently deleted. <strong>${input.sharedDocumentCount}</strong> document(s) you shared stay readable by the people you shared them with.</p>`,
    '</div>',
  ].join('');
}
