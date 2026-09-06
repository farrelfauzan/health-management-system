import { ClinicalDeliveryMessageContext, DocumentCategoryValue } from '@hms/shared-types';

import { RenderedMail } from '../../../common/mail/mail.types';

const DISPLAY_LOCALE = 'id-ID';
const CLINIC_TIME_ZONE = 'Asia/Jakarta';

/**
 * The document type, in the two languages the channel speaks. Fixed strings
 * on purpose (FR-E4-27): the category is an enum, so nothing typed by a
 * person — no title, no note, no value — can reach the caption through it.
 */
const CATEGORY_LABELS: Readonly<Record<DocumentCategoryValue, { id: string; en: string }>> = {
  LAB_RESULT: { id: 'hasil laboratorium', en: 'lab result' },
  RADIOLOGY: { id: 'hasil radiologi', en: 'radiology report' },
  EXTERNAL_MEDICAL_RECORD: { id: 'rekam medis eksternal', en: 'external medical record' },
  REFERRAL_LETTER: { id: 'surat rujukan', en: 'referral letter' },
  CONSENT_FORM: { id: 'formulir persetujuan', en: 'consent form' },
  DISCHARGE_SUMMARY: { id: 'resume pulang', en: 'discharge summary' },
  MEDICAL_CERTIFICATE: { id: 'surat keterangan dokter', en: 'medical certificate' },
  INSURANCE: { id: 'dokumen asuransi', en: 'insurance document' },
  IDENTITY: { id: 'dokumen identitas', en: 'identity document' },
  OTHER: { id: 'dokumen medis', en: 'medical document' },
};

/**
 * The message that carries a released clinical document (`P16-T40`,
 * FR-E4-27): the clinic, the patient it is for, the *kind* of document and
 * its date — and nothing else. No title, no result value, no diagnosis, no
 * interpretation: a caption is rendered in the chat list and on a lock
 * screen, and "HbA1c 9.2%" is exactly what must never be read there. The
 * patient's name is included because a family phone is shared (§7.4.11) and
 * the password keeps the content closed to everyone else on it. Indonesian
 * first, English after, like the invoice caption it mirrors.
 */
export function buildClinicalWhatsappCaption(context: ClinicalDeliveryMessageContext): string {
  return [
    `${buildLeadLine(context)} Dokumen terlampir.`,
    context.passwordSentence,
    `${buildLeadLineEn(context)} The document is attached.`,
  ].join('\n\n');
}

export function buildClinicalDeliveryMail(context: ClinicalDeliveryMessageContext): RenderedMail {
  const labels = CATEGORY_LABELS[context.category];
  const subject = `${capitalise(labels.id)} dari ${context.clinicName} / ${capitalise(labels.en)} from ${context.clinicName}`;
  const text = buildClinicalWhatsappCaption(context);
  return { subject, text, html: buildHtml(text) };
}

function buildLeadLine(context: ClinicalDeliveryMessageContext): string {
  return `${context.clinicName}: ${CATEGORY_LABELS[context.category].id} atas nama ${context.patientName}${formatDateSuffix(context.documentDate, 'tanggal')}.`;
}

function buildLeadLineEn(context: ClinicalDeliveryMessageContext): string {
  return `${context.clinicName}: ${CATEGORY_LABELS[context.category].en} for ${context.patientName}${formatDateSuffix(context.documentDate, 'dated')}.`;
}

function formatDateSuffix(documentDate: Date | null, label: string): string {
  return documentDate === null ? '' : `, ${label} ${formatDate(documentDate)}`;
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    dateStyle: 'long',
    timeZone: CLINIC_TIME_ZONE,
  }).format(value);
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildHtml(text: string): string {
  const paragraphs = text.split('\n\n').map((line) => `<p>${escapeHtml(line)}</p>`);
  return [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.6;color:#111827">',
    ...paragraphs,
    '</div>',
  ].join('');
}
