import { InvoiceDeliveryMessageContext } from '@hms/shared-types';

import { RenderedMail } from '../../../common/mail/mail.types';

const CURRENCY_PREFIX = 'Rp ';
const DISPLAY_LOCALE = 'id-ID';
const CLINIC_TIME_ZONE = 'Asia/Jakarta';

/**
 * The message that carries an invoice (`P16-T26`, FR-E4-15): the clinic, the
 * patient it is for, the invoice number, the total and the date — and
 * nothing else. No line item, no procedure, no medication: a caption is
 * rendered in the chat list and on a lock screen, and an itemisation that
 * would reveal a diagnosis is the reason this is a rule and not a guideline.
 * Indonesian first, English after, like every other message the clinic
 * sends. The password sentence names the scheme and never the value
 * (FR-E4-08).
 */
export function buildInvoiceWhatsappCaption(context: InvoiceDeliveryMessageContext): string {
  const lead = buildLeadLine(context);
  if (context.link !== null) {
    return [
      `${lead} Unduh dokumen melalui tautan berikut (berlaku sampai ${formatDate(context.link.expiresAt)}):`,
      context.link.url,
      `${buildLeadLineEn(context)} Download it from the link above; it expires on ${formatDate(context.link.expiresAt)}.`,
    ].join('\n\n');
  }
  return [
    `${lead} Dokumen terlampir.`,
    context.passwordSentence ?? '',
    `${buildLeadLineEn(context)} The document is attached.`,
  ]
    .filter((line) => line !== '')
    .join('\n\n');
}

export function buildInvoiceDeliveryMail(context: InvoiceDeliveryMessageContext): RenderedMail {
  const subject = `Kuitansi ${context.invoiceNumber} dari ${context.clinicName} / Invoice ${context.invoiceNumber} from ${context.clinicName}`;
  const text = buildInvoiceWhatsappCaption(context);
  return { subject, text, html: buildHtml(context) };
}

function buildLeadLine(context: InvoiceDeliveryMessageContext): string {
  return `${context.clinicName}: kuitansi ${context.invoiceNumber} atas nama ${context.patientName} sebesar ${formatMoney(context.totalAmount)}${formatIssuedSuffix(context.issuedAt, 'tanggal')}.`;
}

function buildLeadLineEn(context: InvoiceDeliveryMessageContext): string {
  return `${context.clinicName}: invoice ${context.invoiceNumber} for ${context.patientName}, ${formatMoney(context.totalAmount)}${formatIssuedSuffix(context.issuedAt, 'dated')}.`;
}

function formatIssuedSuffix(issuedAt: Date | null, label: string): string {
  return issuedAt === null ? '' : `, ${label} ${formatDate(issuedAt)}`;
}

function formatMoney(amount: number): string {
  const rounded = Number.isFinite(amount) ? Math.round(amount) : 0;
  return `${CURRENCY_PREFIX}${new Intl.NumberFormat(DISPLAY_LOCALE, { maximumFractionDigits: 0 }).format(rounded)}`;
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    dateStyle: 'long',
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

function buildHtml(context: InvoiceDeliveryMessageContext): string {
  const paragraphs = buildInvoiceWhatsappCaption(context)
    .split('\n\n')
    .map((line) =>
      context.link !== null && line === context.link.url
        ? buildLinkButton(line)
        : `<p>${escapeHtml(line)}</p>`,
    );
  return [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.6;color:#111827">',
    ...paragraphs,
    '</div>',
  ].join('');
}

function buildLinkButton(url: string): string {
  const safeUrl = escapeHtml(url);
  return [
    `<p><a href="${safeUrl}" style="display:inline-block;padding:10px 18px;background:#0f766e;color:#ffffff;border-radius:6px;text-decoration:none">Unduh kuitansi / Download invoice</a></p>`,
    `<p style="font-size:13px;color:#6b7280">${safeUrl}</p>`,
  ].join('');
}
