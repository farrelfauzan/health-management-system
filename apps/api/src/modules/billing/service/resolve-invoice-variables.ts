import {
  INVOICE_TEMPLATE_VARIABLES,
  ResolveInvoiceItemInput,
  ResolveInvoiceVariablesParams,
  ResolvedInvoiceVariables,
  TemplateVariableWarning,
} from '@hms/shared-types';

import { formatTerbilang } from './format-terbilang';

const CURRENCY_PREFIX = 'Rp ';
const MASK_CHARACTER = '•';
const NIK_VISIBLE_DIGITS = 4;
const DISPLAY_LOCALE = 'id-ID';

const SEX_LABELS: Readonly<Record<string, string>> = {
  MALE: 'Laki-laki',
  FEMALE: 'Perempuan',
};

/**
 * Fills every registry token from one invoice (`P16-T04`).
 *
 * Pure over its parameters. Nothing is fetched and nothing is decrypted here:
 * the render service reads the invoice, the clinic profile, the stay and the
 * payment, decrypts what its caller was permitted to decrypt, and hands the
 * result over. That keeps the decision about *which* patient identifiers may
 * be read behind the permission guard rather than inside a formatter, and it
 * is what lets the whole token set be tested against fixtures.
 *
 * Two rules hold for every token:
 *
 *   * **An unresolved token is empty, never the raw token.** `{{patient.phone}}`
 *     printed on a receipt is worse than a blank — a blank reads as "not
 *     recorded", the token reads as broken software.
 *   * **Every empty token is accounted for by a warning.** A silent blank is
 *     indistinguishable from a field the clinic genuinely left empty, and the
 *     render service records these against the document so somebody can
 *     answer "why is the doctor's name missing".
 *
 * Warning granularity follows the data. A section that is absent altogether —
 * an outpatient invoice has no admission — reports one warning against
 * `<section>.*` rather than one per token, because five warnings saying the
 * same thing is how a warning list stops being read.
 *
 * The NIK is the one field with a rule of its own: the plaintext arrives so it
 * can be masked and is never emitted. There is no plaintext token in the
 * registry to emit it into.
 */
export function resolveInvoiceVariables(
  params: ResolveInvoiceVariablesParams,
): ResolvedInvoiceVariables {
  const warnings: TemplateVariableWarning[] = [];
  const values: Record<string, string> = {};
  for (const variable of INVOICE_TEMPLATE_VARIABLES) {
    if (variable.type === 'block' || variable.token.startsWith('item.')) {
      continue;
    }
    values[variable.token] = '';
  }
  fillClinic(params, values, warnings);
  fillInvoice(params, values, warnings);
  fillPatient(params, values, warnings);
  fillEncounter(params, values, warnings);
  fillAdmission(params, values, warnings);
  fillPayment(params, values, warnings);
  return {
    values,
    items: buildItemRows(params.items, warnings),
    warnings,
  };
}

function fillClinic(
  params: ResolveInvoiceVariablesParams,
  values: Record<string, string>,
  warnings: TemplateVariableWarning[],
): void {
  const clinic = params.clinic;
  if (clinic === null) {
    warnings.push({ token: 'clinic.*', reason: 'The clinic profile has not been configured' });
    return;
  }
  setText(values, warnings, 'clinic.name', clinic.name);
  setText(values, warnings, 'clinic.legalName', clinic.legalName);
  setText(values, warnings, 'clinic.address', clinic.address);
  setText(values, warnings, 'clinic.phone', clinic.phoneNumber);
  setText(values, warnings, 'clinic.email', clinic.email);
  setText(values, warnings, 'clinic.licenseNumber', clinic.licenseNumber);
  setText(values, warnings, 'clinic.taxId', clinic.taxId);
  setText(values, warnings, 'clinic.logo', clinic.logoDataUri);
}

function fillInvoice(
  params: ResolveInvoiceVariablesParams,
  values: Record<string, string>,
  warnings: TemplateVariableWarning[],
): void {
  const invoice = params.invoice;
  values['invoice.number'] = invoice.invoiceNumber;
  values['invoice.status'] = invoice.status;
  values['invoice.total'] = formatMoney(invoice.totalAmount);
  values['invoice.itemCount'] = String(params.items.length);
  values['invoice.totalInWords'] = resolveTotalInWords(invoice.totalAmount, warnings);
  setDate(values, warnings, 'invoice.issuedAt', invoice.issuedAt, params.timeZone);
  setText(values, warnings, 'invoice.qrVerify', invoice.qrVerifyDataUri);
}

/**
 * Sen have not circulated since the 1990s, so a fractional total is a
 * rounding artefact rather than money. It is rounded and *said* rather than
 * silently truncated — a receipt whose words and figures disagree is the one
 * outcome nobody can explain at the counter.
 */
function resolveTotalInWords(totalAmount: number, warnings: TemplateVariableWarning[]): string {
  if (!Number.isFinite(totalAmount) || totalAmount < 0) {
    warnings.push({
      token: 'invoice.totalInWords',
      reason: 'The invoice total cannot be spelled in words',
    });
    return '';
  }
  const wholeRupiah = Math.round(totalAmount);
  if (wholeRupiah !== totalAmount) {
    warnings.push({
      token: 'invoice.totalInWords',
      reason: 'The invoice total was rounded to whole rupiah to be spelled in words',
    });
  }
  try {
    return formatTerbilang(wholeRupiah);
  } catch {
    // Only reachable above 999 trillion rupiah, which the scale words run
    // out at. An empty line with a warning beats a failed render.
    warnings.push({
      token: 'invoice.totalInWords',
      reason: 'The invoice total is larger than this document can spell in words',
    });
    return '';
  }
}

function fillPatient(
  params: ResolveInvoiceVariablesParams,
  values: Record<string, string>,
  warnings: TemplateVariableWarning[],
): void {
  const patient = params.patient;
  if (patient === null) {
    warnings.push({ token: 'patient.*', reason: 'This invoice has no patient attached' });
    return;
  }
  setText(values, warnings, 'patient.fullName', patient.fullName);
  setText(values, warnings, 'patient.mrn', patient.mrn);
  setText(values, warnings, 'patient.address', patient.address);
  setText(values, warnings, 'patient.phone', patient.phoneNumber);
  setDate(values, warnings, 'patient.dateOfBirth', patient.dateOfBirth, params.timeZone);
  setText(values, warnings, 'patient.sex', resolveSexLabel(patient.sex));
  setText(values, warnings, 'patient.nikMasked', maskNik(patient.nik));
}

function fillEncounter(
  params: ResolveInvoiceVariablesParams,
  values: Record<string, string>,
  warnings: TemplateVariableWarning[],
): void {
  const encounter = params.encounter;
  if (encounter === null) {
    warnings.push({ token: 'encounter.*', reason: 'This invoice has no encounter attached' });
    return;
  }
  setDate(values, warnings, 'encounter.date', encounter.date, params.timeZone);
  setText(values, warnings, 'encounter.doctorName', encounter.doctorName);
  setText(values, warnings, 'encounter.specialty', encounter.specialty);
}

function fillAdmission(
  params: ResolveInvoiceVariablesParams,
  values: Record<string, string>,
  warnings: TemplateVariableWarning[],
): void {
  const admission = params.admission;
  if (admission === null) {
    warnings.push({ token: 'admission.*', reason: 'This invoice has no admission attached' });
    return;
  }
  setText(values, warnings, 'admission.roomLabel', admission.roomLabel);
  setText(
    values,
    warnings,
    'admission.nights',
    admission.nights === null ? null : String(admission.nights),
  );
}

function fillPayment(
  params: ResolveInvoiceVariablesParams,
  values: Record<string, string>,
  warnings: TemplateVariableWarning[],
): void {
  const payment = params.payment;
  if (payment === null) {
    warnings.push({ token: 'payment.*', reason: 'This invoice has not been paid' });
    return;
  }
  setText(values, warnings, 'payment.method', payment.method);
  setText(values, warnings, 'payment.reference', payment.referenceNumber);
  setText(values, warnings, 'payment.cashierName', payment.cashierName);
  setDateTime(values, warnings, 'payment.paidAt', payment.paidAt, params.timeZone);
}

function buildItemRows(
  items: readonly ResolveInvoiceItemInput[],
  warnings: TemplateVariableWarning[],
): ReadonlyArray<Readonly<Record<string, string>>> {
  if (items.length === 0) {
    warnings.push({ token: 'items', reason: 'This invoice has no line items' });
    return [];
  }
  return items.map((item, index) => ({
    'item.no': String(index + 1),
    'item.description': item.description,
    'item.quantity': String(item.quantity),
    'item.unitPrice': formatMoney(item.unitPrice),
    'item.amount': formatMoney(item.amount),
  }));
}

function setText(
  values: Record<string, string>,
  warnings: TemplateVariableWarning[],
  token: string,
  value: string | null,
): void {
  const trimmed = value?.trim() ?? '';
  if (trimmed === '') {
    warnings.push({ token, reason: 'No value is recorded for this field' });
    return;
  }
  values[token] = trimmed;
}

function setDate(
  values: Record<string, string>,
  warnings: TemplateVariableWarning[],
  token: string,
  value: Date | null,
  timeZone: string,
): void {
  if (value === null || Number.isNaN(value.getTime())) {
    warnings.push({ token, reason: 'No value is recorded for this field' });
    return;
  }
  values[token] = formatClinicDate(value, timeZone);
}

function setDateTime(
  values: Record<string, string>,
  warnings: TemplateVariableWarning[],
  token: string,
  value: Date | null,
  timeZone: string,
): void {
  if (value === null || Number.isNaN(value.getTime())) {
    warnings.push({ token, reason: 'No value is recorded for this field' });
    return;
  }
  values[token] = `${formatClinicDate(value, timeZone)}, ${formatClinicTime(value, timeZone)}`;
}

function resolveSexLabel(sex: string | null): string | null {
  if (sex === null) {
    return null;
  }
  // An unmapped value passes through rather than becoming a blank: a code on
  // the receipt is at least true, and a new enum member must not silently
  // erase the field.
  return SEX_LABELS[sex] ?? sex;
}

/**
 * All but the last four digits become bullets, matching how the patient
 * surfaces already display an identifier. A NIK too short to mask is refused
 * rather than partially shown — a "masked" value that reveals most of itself
 * is worse than an empty field, because it looks like it was handled.
 */
function maskNik(nik: string | null): string | null {
  const digits = nik?.trim() ?? '';
  if (digits.length <= NIK_VISIBLE_DIGITS) {
    return null;
  }
  const visible = digits.slice(-NIK_VISIBLE_DIGITS);
  return `${MASK_CHARACTER.repeat(digits.length - NIK_VISIBLE_DIGITS)}${visible}`;
}

function formatMoney(amount: number): string {
  const rounded = Number.isFinite(amount) ? Math.round(amount) : 0;
  return `${CURRENCY_PREFIX}${new Intl.NumberFormat(DISPLAY_LOCALE, {
    maximumFractionDigits: 0,
  }).format(rounded)}`;
}

function formatClinicDate(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone,
  }).format(value);
}

/**
 * Built from parts rather than formatted directly: `id-ID` separates hours
 * and minutes with a dot, and a receipt that reads `14.22` next to `Rp
 * 275.000` invites the reader to parse one of them as the other.
 */
function formatClinicTime(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).formatToParts(value);
  const hour = parts.find((part) => part.type === 'hour')?.value ?? '00';
  const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';
  return `${hour}:${minute}`;
}
