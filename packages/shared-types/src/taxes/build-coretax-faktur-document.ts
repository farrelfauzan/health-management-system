import { getCalendarDateInTimeZone } from '#registration-flow/schemas';
import {
  CORETAX_FAKTUR_BUYER_COUNTRY,
  CORETAX_FAKTUR_EXPORTED_CODES,
  CORETAX_FAKTUR_GOODS_OPTION,
  CORETAX_FAKTUR_NATIONAL_ID_DOCUMENT,
  CORETAX_FAKTUR_NON_TIN_BUYER_IDTKU,
  CORETAX_FAKTUR_NON_TIN_BUYER_TIN,
  CORETAX_FAKTUR_OPTION,
  CORETAX_FAKTUR_SERVICES_OPTION,
  CORETAX_KODE_08_STATED_VAT_RATE_PERCENT,
} from '#taxes/coretax-faktur';
import { NITKU_DIGIT_COUNT, NPWP_DIGIT_COUNT } from '#taxes/schemas';
import type {
  BuildCoretaxFakturDocumentParams,
  BuiltCoretaxFakturDocument,
  CoretaxFakturExportIssue,
  CoretaxFakturGoodService,
  CoretaxFakturGroup,
  CoretaxFakturSourceInvoice,
  CoretaxFakturSourceLine,
  CoretaxFakturTaxInvoice,
} from '#taxes/types';

const EXEMPT_FAKTUR_CODE = '08';
const CENTS = 100;
const PERCENT = 100;
const NPWP_PATTERN = new RegExp(`^\\d{${NPWP_DIGIT_COUNT}}$`);
const NITKU_PATTERN = new RegExp(`^\\d{${NITKU_DIGIT_COUNT}}$`);
const EXPORTED_CODES: readonly string[] = CORETAX_FAKTUR_EXPORTED_CODES;

/** Commercial rounding to two decimals, the template's rule for every amount. */
function roundCents(amount: number): number {
  return Math.round(amount * CENTS) / CENTS;
}

function isExported(line: CoretaxFakturSourceLine): boolean {
  return line.fakturTransactionCode !== null && EXPORTED_CODES.includes(line.fakturTransactionCode);
}

/** One faktur per invoice and faktur code: the transaction code is per `TaxInvoice`. */
function groupByFakturCode(invoice: CoretaxFakturSourceInvoice): CoretaxFakturGroup[] {
  const codes = [
    ...new Set(invoice.lines.filter(isExported).map((line) => line.fakturTransactionCode)),
  ];
  return codes.sort().map((code) => ({
    invoice,
    code: code ?? '',
    lines: invoice.lines.filter((line) => line.fakturTransactionCode === code),
  }));
}

function validateClinic(params: BuildCoretaxFakturDocumentParams): CoretaxFakturExportIssue[] {
  const issues: CoretaxFakturExportIssue[] = [];
  const npwp = params.clinicNpwp ?? '';
  if (!NPWP_PATTERN.test(npwp)) {
    issues.push({
      code: 'CLINIC_NPWP_INVALID',
      field: 'clinicNpwp',
      message:
        'The clinic NPWP must be 16 digits (Coretax format) before a faktur file can be made',
    });
  }
  const nitku = params.clinicNitku ?? '';
  if (!NITKU_PATTERN.test(nitku) || !nitku.startsWith(npwp)) {
    issues.push({
      code: 'CLINIC_NITKU_INVALID',
      field: 'clinicNitku',
      message: "The clinic NITKU must be 22 digits starting with the clinic's NPWP",
    });
  }
  return issues;
}

function validateGroup(group: CoretaxFakturGroup): CoretaxFakturExportIssue[] {
  const subject = { subjectId: group.invoice.invoiceId, subjectLabel: group.invoice.invoiceNumber };
  const issues: CoretaxFakturExportIssue[] = [];
  const push = (code: CoretaxFakturExportIssue['code'], field: string, message: string): void => {
    if (!issues.some((issue) => issue.code === code)) {
      issues.push({ ...subject, code, field, message });
    }
  };
  if (group.invoice.buyerName.trim() === '') {
    push('BUYER_NAME_MISSING', 'buyerName', 'The patient has no name to put on the faktur');
  }
  if (group.invoice.buyerAddress.trim() === '') {
    push(
      'BUYER_ADDRESS_MISSING',
      'buyerAddress',
      'The patient has no address to put on the faktur',
    );
  }
  group.lines.forEach((line) => {
    if (line.coretaxItemCode === null) {
      push(
        'ITEM_CODE_MISSING',
        'coretaxItemCode',
        `"${line.description}" has no Coretax item code`,
      );
    }
    if (line.coretaxUnitCode === null) {
      push('UNIT_CODE_MISSING', 'coretaxUnitCode', `"${line.description}" has no Coretax unit`);
    }
    if (
      group.code === EXEMPT_FAKTUR_CODE &&
      (!line.coretaxAdditionalInfo || !line.coretaxFacilityStamp)
    ) {
      push(
        'FACILITY_MISSING',
        'coretaxFacilityStamp',
        'A kode-08 tax code needs its keterangan tambahan and cap fasilitas',
      );
    }
  });
  return issues;
}

/**
 * One faktur line. Prices are tax-inclusive (D-038), so the template's
 * "Harga Satuan" is the price before PPN per unit, rounded up to the cent,
 * and the few cents that makes too much go in "Total Diskon" — the
 * template's DPP is `Qty × Price − Discount` and must equal the snapshot.
 * A kode-04 line carries the issue-time DPP nilai lain, rate and PPN; a
 * kode-08 line states DPP nilai lain = DPP and the PPN it is exempted from.
 */
function toGoodService(line: CoretaxFakturSourceLine, code: string): CoretaxFakturGoodService {
  const taxableAmount = line.taxableAmount ?? 0;
  const price = Math.ceil((taxableAmount / line.quantity) * CENTS) / CENTS;
  const isExempt = code === EXEMPT_FAKTUR_CODE;
  const otherTaxBase = isExempt ? taxableAmount : (line.taxBase ?? taxableAmount);
  const vatRate = isExempt ? CORETAX_KODE_08_STATED_VAT_RATE_PERCENT : (line.taxRatePercent ?? 0);
  return {
    opt:
      line.itemType === 'MEDICATION' ? CORETAX_FAKTUR_GOODS_OPTION : CORETAX_FAKTUR_SERVICES_OPTION,
    code: line.coretaxItemCode ?? '',
    name: line.description,
    unit: line.coretaxUnitCode ?? '',
    price,
    qty: line.quantity,
    totalDiscount: roundCents(price * line.quantity - taxableAmount),
    taxBase: taxableAmount,
    otherTaxBase,
    vatRate,
    vat: isExempt ? roundCents((otherTaxBase * vatRate) / PERCENT) : line.taxAmount,
    stlgRate: 0,
    stlg: 0,
  };
}

function toTaxInvoice(params: {
  group: CoretaxFakturGroup;
  sellerIdTku: string;
  timeZone: string;
}): CoretaxFakturTaxInvoice {
  const { group } = params;
  const exemptLine = group.lines[0];
  const isExempt = group.code === EXEMPT_FAKTUR_CODE;
  return {
    invoiceId: group.invoice.invoiceId,
    taxInvoiceDate: getCalendarDateInTimeZone(group.invoice.issuedAt, params.timeZone),
    taxInvoiceOpt: CORETAX_FAKTUR_OPTION,
    trxCode: group.code,
    addInfo: isExempt ? (exemptLine?.coretaxAdditionalInfo ?? '') : '',
    customDoc: '',
    customDocMonthYear: '',
    refDesc: group.invoice.invoiceNumber,
    facilityStamp: isExempt ? (exemptLine?.coretaxFacilityStamp ?? '') : '',
    sellerIdTku: params.sellerIdTku,
    buyerTin: CORETAX_FAKTUR_NON_TIN_BUYER_TIN,
    buyerDocument: CORETAX_FAKTUR_NATIONAL_ID_DOCUMENT,
    buyerCountry: CORETAX_FAKTUR_BUYER_COUNTRY,
    buyerDocumentNumber: group.invoice.buyerNik ?? '',
    buyerName: group.invoice.buyerName.trim(),
    buyerAddress: group.invoice.buyerAddress.trim(),
    buyerEmail: '',
    buyerIdTku: CORETAX_FAKTUR_NON_TIN_BUYER_IDTKU,
    goodServices: group.lines.map((line) => toGoodService(line, group.code)),
  };
}

/**
 * The Coretax Faktur Keluaran file for a finalized PPN keluaran draft
 * (P27-T09), or every reason it cannot be made yet. One `TaxInvoice` per
 * invoice and faktur code (01, 04 or 08 — lines without a code or not a PPN
 * object are not fakturs). The seller is the clinic: NPWP as `TIN`, NITKU
 * as `SellerIDTKU`. The buyer is the patient, identified the way the
 * template spells a buyer without NPWP: NIK as `National ID`, TIN
 * `0000000000000000`, NITKU `000000`. A patient with no NIK on file cannot
 * be named on a faktur, so that invoice is left out and counted as
 * digunggung — the retail sales DJP reports through its separate Retail
 * template, not this file.
 */
export function buildCoretaxFakturDocument(
  params: BuildCoretaxFakturDocumentParams,
): BuiltCoretaxFakturDocument {
  const identified = params.invoices.filter((invoice) => invoice.buyerNik !== null);
  const digunggungInvoiceIds = params.invoices
    .filter((invoice) => invoice.buyerNik === null && invoice.lines.some(isExported))
    .map((invoice) => invoice.invoiceId);
  const groups = identified.flatMap(groupByFakturCode);
  const issues = [...validateClinic(params), ...groups.flatMap(validateGroup)];
  if (issues.length > 0) {
    return { document: null, issues, digunggungInvoiceIds };
  }
  return {
    document: {
      sellerTin: params.clinicNpwp ?? '',
      taxInvoices: groups.map((group) =>
        toTaxInvoice({ group, sellerIdTku: params.clinicNitku ?? '', timeZone: params.timeZone }),
      ),
    },
    issues: [],
    digunggungInvoiceIds,
  };
}
