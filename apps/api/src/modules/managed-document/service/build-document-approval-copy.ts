import { RenderedMail } from '../../../common/mail/mail.types';

const DISPLAY_LOCALE = 'id-ID';

const CLINIC_TIME_ZONE = 'Asia/Jakarta';

/**
 * Which of the six approval mails to render (`P16-T30`, FR-E5-25/26). Kept
 * as a closed union rather than a template name so a new event cannot ship
 * without copy — the switch below stops compiling.
 */
export type DocumentApprovalMailKind =
  | 'REQUESTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'SUPERSEDED'
  | 'DUE_SOON'
  | 'OVERDUE';

/**
 * Everything the six mails can name. Deliberately small: the document's
 * title, its type, the people either side, and the deadline. The document's
 * *body* is never in here — an approval mail says a decision is wanted, and
 * the decision is made in the app against the frozen submission (FR-E5-21).
 */
export type DocumentApprovalMailContext = {
  kind: DocumentApprovalMailKind;
  clinicName: string;
  documentTitle: string;
  documentTypeName: string;
  drafterEmail: string;
  dueAt: Date | null;
  /** Present on a rejection and nowhere else (US-E5-03). */
  reason: string | null;
  /** Deep link into the workspace the recipient should act in. */
  actionUrl: string;
};

/**
 * The approval mail, Indonesian first and English after (NFR-I18N-01), under
 * the clinic's own name (FR-E5-30) — the same profile every other outbound
 * message uses, so approval mail is not the one thing that arrives from an
 * unfamiliar sender.
 */
export function buildDocumentApprovalMail(context: DocumentApprovalMailContext): RenderedMail {
  const lines = buildBodyLines(context);
  return {
    subject: buildSubject(context),
    text: [...lines, context.actionUrl].join('\n\n'),
    html: buildHtml(lines, context.actionUrl),
  };
}

function buildSubject(context: DocumentApprovalMailContext): string {
  const subjects: Record<DocumentApprovalMailKind, string> = {
    REQUESTED: `Permintaan persetujuan: ${context.documentTitle}`,
    APPROVED: `Disetujui: ${context.documentTitle}`,
    REJECTED: `Ditolak: ${context.documentTitle}`,
    SUPERSEDED: `Permintaan persetujuan dibatalkan: ${context.documentTitle}`,
    DUE_SOON: `Menunggu persetujuan Anda: ${context.documentTitle}`,
    OVERDUE: `Terlambat — menunggu persetujuan Anda: ${context.documentTitle}`,
  };
  return `${subjects[context.kind]} / ${context.clinicName}`;
}

function buildBodyLines(context: DocumentApprovalMailContext): string[] {
  const heading = `${context.clinicName}: ${context.documentTypeName} — ${context.documentTitle}`;
  return [heading, ...buildKindLines(context), ...buildDeadlineLines(context)];
}

function buildKindLines(context: DocumentApprovalMailContext): string[] {
  switch (context.kind) {
    case 'REQUESTED':
      return [
        `${context.drafterEmail} meminta persetujuan Anda atas dokumen ini.`,
        `${context.drafterEmail} has asked for your approval on this document.`,
      ];
    case 'APPROVED':
      return [
        'Dokumen ini telah disetujui dan diterbitkan.',
        'This document has been approved and issued.',
      ];
    case 'REJECTED':
      return [
        `Dokumen ini ditolak dan dikembalikan ke draf. Alasan: ${context.reason ?? '—'}`,
        `This document was rejected and returned to draft. Reason: ${context.reason ?? '—'}`,
      ];
    case 'SUPERSEDED':
      return [
        'Isi atau daftar penyetuju dokumen ini berubah, sehingga permintaan persetujuan sebelumnya dibatalkan.',
        'The content or the approver list changed, so the earlier approval request was voided.',
      ];
    case 'DUE_SOON':
      return [
        'Dokumen ini masih menunggu persetujuan Anda dan tenggatnya sudah dekat.',
        'This document is still waiting for your approval and its deadline is close.',
      ];
    case 'OVERDUE':
      return [
        'Dokumen ini masih menunggu persetujuan Anda dan sudah melewati tenggat. Statusnya tetap menunggu — tidak ada yang disetujui secara otomatis.',
        'This document is still waiting for your approval and is past its deadline. It remains pending — nothing is approved automatically.',
      ];
  }
}

function buildDeadlineLines(context: DocumentApprovalMailContext): string[] {
  if (context.dueAt === null) {
    return [];
  }
  return [`Tenggat / Deadline: ${formatDeadline(context.dueAt)}`];
}

function formatDeadline(value: Date): string {
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: CLINIC_TIME_ZONE,
  }).format(value);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildHtml(lines: readonly string[], actionUrl: string): string {
  const paragraphs = lines.map((line) => `<p>${escapeHtml(line)}</p>`);
  return [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.6;color:#111827">',
    ...paragraphs,
    `<p><a href="${escapeHtml(actionUrl)}">${escapeHtml(actionUrl)}</a></p>`,
    '</div>',
  ].join('');
}
