import { RenderedMail } from '../../../common/mail/mail.types';
import { DocumentApprovalMailKind } from './build-document-approval-copy';

const DISPLAY_LOCALE = 'id-ID';

const CLINIC_TIME_ZONE = 'Asia/Jakarta';

/** One document in a digest: what its own mail would have named, and its own link. */
export type DocumentApprovalDigestItem = {
  documentTitle: string;
  documentTypeName: string;
  drafterEmail: string;
  dueAt: Date | null;
  reason: string | null;
  actionUrl: string;
};

/**
 * Several approval events of one kind for one person, rendered as one mail.
 * `overviewUrl` is where the whole list can be worked through at once — the
 * reason to send a digest at all is that nobody opens twenty-eight links.
 */
export type DocumentApprovalDigestContext = {
  kind: DocumentApprovalMailKind;
  clinicName: string;
  items: readonly DocumentApprovalDigestItem[];
  overviewUrl: string;
};

/**
 * The digest counterpart of `buildDocumentApprovalMail`, for one action that
 * touched many documents at once: a bulk submit, a bulk approval, or one
 * deadline sweep that caught a whole batch. Same language order, same
 * sender name, same rule that a document's body never travels in mail — only
 * the list is new.
 */
export function buildDocumentApprovalDigestMail(
  context: DocumentApprovalDigestContext,
): RenderedMail {
  const leadLines = buildLeadLines(context);
  const itemBlocks = context.items.map((item, index) => buildItemLines(context, item, index));
  const footerLine = `Buka semua / Open all: ${context.overviewUrl}`;
  return {
    subject: buildSubject(context),
    text: [...leadLines, ...itemBlocks.map((lines) => lines.join('\n')), footerLine].join('\n\n'),
    html: buildHtml(leadLines, itemBlocks, context.overviewUrl),
  };
}

function buildSubject(context: DocumentApprovalDigestContext): string {
  const count = `${context.items.length} dokumen`;
  const subjects: Record<DocumentApprovalMailKind, string> = {
    REQUESTED: `Permintaan persetujuan: ${count}`,
    APPROVED: `Disetujui: ${count}`,
    REJECTED: `Ditolak: ${count}`,
    SUPERSEDED: `Permintaan persetujuan dibatalkan: ${count}`,
    DUE_SOON: `Menunggu persetujuan Anda: ${count}`,
    OVERDUE: `Terlambat — menunggu persetujuan Anda: ${count}`,
  };
  return `${subjects[context.kind]} / ${context.clinicName}`;
}

/**
 * The person who asked, named once in the lead when it is one person — the
 * bulk-submit case — and otherwise per item, so a mixed list never credits
 * one drafter with another's documents.
 */
function resolveSoleRequester(context: DocumentApprovalDigestContext): string | null {
  const requesters = new Set(context.items.map((item) => item.drafterEmail));
  const [soleRequester] = requesters;
  return requesters.size === 1 && soleRequester !== undefined ? soleRequester : null;
}

function buildLeadLines(context: DocumentApprovalDigestContext): string[] {
  const count = context.items.length;
  switch (context.kind) {
    case 'REQUESTED': {
      const requester = resolveSoleRequester(context);
      return requester === null
        ? [
            `${count} dokumen berikut menunggu persetujuan Anda.`,
            `The ${count} documents below are waiting for your approval.`,
          ]
        : [
            `${requester} meminta persetujuan Anda atas ${count} dokumen berikut.`,
            `${requester} has asked for your approval on the ${count} documents below.`,
          ];
    }
    case 'APPROVED':
      return [
        `${count} dokumen berikut telah disetujui dan diterbitkan.`,
        `The ${count} documents below have been approved and issued.`,
      ];
    case 'REJECTED':
      return [
        `${count} dokumen berikut ditolak dan dikembalikan ke draf.`,
        `The ${count} documents below were rejected and returned to draft.`,
      ];
    case 'SUPERSEDED':
      return [
        `Isi atau daftar penyetuju ${count} dokumen berikut berubah, sehingga permintaan persetujuannya dibatalkan.`,
        `The content or approver list of the ${count} documents below changed, so their approval requests were voided.`,
      ];
    case 'DUE_SOON':
      return [
        `${count} dokumen berikut masih menunggu persetujuan Anda dan tenggatnya sudah dekat.`,
        `The ${count} documents below are still waiting for your approval and their deadlines are close.`,
      ];
    case 'OVERDUE':
      return [
        `${count} dokumen berikut masih menunggu persetujuan Anda dan sudah melewati tenggat. Statusnya tetap menunggu — tidak ada yang disetujui secara otomatis.`,
        `The ${count} documents below are still waiting for your approval and are past their deadlines. They remain pending — nothing is approved automatically.`,
      ];
  }
}

function buildItemLines(
  context: DocumentApprovalDigestContext,
  item: DocumentApprovalDigestItem,
  index: number,
): string[] {
  const isRequesterPerItem = context.kind === 'REQUESTED' && resolveSoleRequester(context) === null;
  return [
    `${index + 1}. ${item.documentTitle} — ${item.documentTypeName}`,
    ...(isRequesterPerItem ? [`Diajukan oleh / Submitted by: ${item.drafterEmail}`] : []),
    ...(item.dueAt === null ? [] : [`Tenggat / Deadline: ${formatDeadline(item.dueAt)}`]),
    ...(item.reason === null ? [] : [`Alasan / Reason: ${item.reason}`]),
    item.actionUrl,
  ];
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

function buildHtmlLink(url: string): string {
  return `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`;
}

/** The item's last line is its link; everything before it is plain text. */
function buildHtmlItem(lines: readonly string[]): string {
  const url = lines[lines.length - 1] ?? '';
  const textLines = lines.slice(0, -1).map((line) => escapeHtml(line));
  return `<li style="margin-bottom:12px">${[...textLines, buildHtmlLink(url)].join('<br>')}</li>`;
}

function buildHtml(
  leadLines: readonly string[],
  itemBlocks: readonly (readonly string[])[],
  overviewUrl: string,
): string {
  return [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.6;color:#111827">',
    ...leadLines.map((line) => `<p>${escapeHtml(line)}</p>`),
    '<ul style="list-style:none;padding:0">',
    ...itemBlocks.map((lines) => buildHtmlItem(lines)),
    '</ul>',
    `<p>Buka semua / Open all: ${buildHtmlLink(overviewUrl)}</p>`,
    '</div>',
  ].join('');
}
