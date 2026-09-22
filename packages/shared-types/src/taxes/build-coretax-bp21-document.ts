import {
  CORETAX_BP21_DOCUMENT_NUMBER_PREFIX,
  CORETAX_BP21_NO_FACILITY,
  CORETAX_BP21_REFERENCE_DOCUMENT,
  CORETAX_BP21_TAX_OBJECT_CODES,
  CORETAX_PTKP_LABELS,
} from '#taxes/coretax-bp21';
import { NITKU_DIGIT_COUNT, NPWP_DIGIT_COUNT } from '#taxes/schemas';
import type {
  BuildCoretaxBp21DocumentParams,
  BuiltCoretaxBp21Document,
  CoretaxBp21ClinicianSource,
  CoretaxBp21Line,
  CoretaxExportIssue,
  Pph21ReportLine,
  Pph21ReportSummary,
} from '#taxes/types';

/** The NITKU suffix of a head office: NPWP + `000000` (PMK 112/2022 as amended). */
const HEAD_OFFICE_SUFFIX = '000000';
const DOCTOR_ID_REFERENCE_LENGTH = 8;
const MAX_DECIMAL_PLACES = 2;
const NPWP_PATTERN = new RegExp(`^\\d{${NPWP_DIGIT_COUNT}}$`);
const NITKU_PATTERN = new RegExp(`^\\d{${NITKU_DIGIT_COUNT}}$`);

type LineContext = {
  period: string;
  lastDay: string;
  deemedPercent: number;
  withholderPlaceOfBusinessId: string;
};

function resolveLastDayOfPeriod(period: string): string {
  const [year = 0, month = 1] = period.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${period}-${String(lastDay).padStart(2, '0')}`;
}

function hasAtMostTwoDecimals(amount: number): boolean {
  const scaled = amount * 10 ** MAX_DECIMAL_PLACES;
  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
}

/**
 * The template's `Rate` is one number: the Pasal 17 bracket the DPP lands
 * in, as the converter's own `PS17` formula picks it. The draft's slices
 * already say which bracket that is — the highest one the base reached.
 */
function resolveMarginalRate(line: Pph21ReportLine): number {
  const reached = line.slices.filter((slice) => slice.taxableAmount > 0);
  return (reached.at(-1) ?? line.slices[0])?.ratePercent ?? 0;
}

function validateClinic(params: BuildCoretaxBp21DocumentParams): CoretaxExportIssue[] {
  const issues: CoretaxExportIssue[] = [];
  const npwp = params.clinicNpwp ?? '';
  if (!NPWP_PATTERN.test(npwp)) {
    issues.push({
      code: 'CLINIC_NPWP_INVALID',
      field: 'clinicNpwp',
      message: 'The clinic NPWP must be 16 digits (Coretax format) before a BP21 file can be made',
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

function validateLine(
  line: Pph21ReportLine,
  clinician: CoretaxBp21ClinicianSource | undefined,
): CoretaxExportIssue[] {
  const subject = { subjectId: line.doctorId, subjectLabel: line.doctorName };
  const issues: CoretaxExportIssue[] = [];
  const tin = clinician?.taxIdentityNumber ?? null;
  if (tin === null) {
    issues.push({
      ...subject,
      code: 'TAX_IDENTITY_MISSING',
      field: 'taxIdentityNumber',
      message: 'No NPWP or NIK on file',
    });
  } else if (!NPWP_PATTERN.test(tin)) {
    issues.push({
      ...subject,
      code: 'TAX_IDENTITY_NOT_16_DIGITS',
      field: 'taxIdentityNumber',
      message: 'Coretax needs a 16-digit NPWP or NIK; a 15-digit NPWP must be replaced',
    });
  }
  if (!clinician?.ptkpStatus) {
    issues.push({
      ...subject,
      code: 'PTKP_STATUS_MISSING',
      field: 'ptkpStatus',
      message: 'The BP21 template requires a PTKP status',
    });
  }
  if (line.grossFee < 0) {
    issues.push({
      ...subject,
      code: 'GROSS_NOT_POSITIVE',
      field: 'grossFee',
      message: 'A negative month (reversals only) cannot be a BP21; correct the ledger first',
    });
  }
  if (!hasAtMostTwoDecimals(line.grossFee)) {
    issues.push({
      ...subject,
      code: 'AMOUNT_PRECISION',
      field: 'grossFee',
      message: 'Amounts may carry at most two decimal places',
    });
  }
  return issues;
}

function toCoretaxLine(params: {
  line: Pph21ReportLine;
  clinician: CoretaxBp21ClinicianSource;
  context: LineContext;
}): CoretaxBp21Line {
  const { line, clinician, context } = params;
  const tin = clinician.taxIdentityNumber ?? '';
  const [year = '0', month = '0'] = context.period.split('-');
  const reference = line.doctorId.slice(0, DOCTOR_ID_REFERENCE_LENGTH).toUpperCase();
  return {
    doctorId: line.doctorId,
    taxPeriodMonth: Number(month),
    taxPeriodYear: Number(year),
    counterpartTin: tin,
    recipientPlaceOfBusinessId: `${tin}${HEAD_OFFICE_SUFFIX}`,
    ptkpLabel: clinician.ptkpStatus ? CORETAX_PTKP_LABELS[clinician.ptkpStatus] : '',
    taxCertificate: CORETAX_BP21_NO_FACILITY,
    taxObjectCode: CORETAX_BP21_TAX_OBJECT_CODES[line.profession],
    gross: line.grossFee,
    deemedPercent: context.deemedPercent,
    ratePercent: resolveMarginalRate(line),
    documentType: CORETAX_BP21_REFERENCE_DOCUMENT,
    documentNumber: `${CORETAX_BP21_DOCUMENT_NUMBER_PREFIX}/${context.period}/${reference}`,
    documentDate: context.lastDay,
    withholderPlaceOfBusinessId: context.withholderPlaceOfBusinessId,
    withholdingDate: context.lastDay,
  };
}

/**
 * The Coretax BP21 file for a finalized PPh 21 draft (P27-T08), or every
 * reason it cannot be made yet. One `Bp21` per clinician whose month is
 * above zero; a month that nets to exactly zero owes no bukti potong and is
 * left out. The withholder is the clinic: NPWP as `TIN`, NITKU as
 * `IDPlaceOfBusinessActivity`. Each clinician's own NITKU is their NPWP (or
 * NIK) with the head-office suffix, as in DJP's sample. The reference
 * document is the month's jasa medis statement, dated — like the withholding —
 * the last day of the month.
 */
export function buildCoretaxBp21Document(
  params: BuildCoretaxBp21DocumentParams,
): BuiltCoretaxBp21Document {
  const lines = (params.report.lines as Pph21ReportLine[]).filter((line) => line.grossFee !== 0);
  const skippedDoctorIds = (params.report.lines as Pph21ReportLine[])
    .filter((line) => line.grossFee === 0)
    .map((line) => line.doctorId);
  const clinicians = new Map(params.clinicians.map((clinician) => [clinician.doctorId, clinician]));
  const issues = [
    ...validateClinic(params),
    ...lines.flatMap((line) => validateLine(line, clinicians.get(line.doctorId))),
  ];
  if (issues.length > 0) {
    return { document: null, issues, skippedDoctorIds };
  }
  const context: LineContext = {
    period: params.report.period,
    lastDay: resolveLastDayOfPeriod(params.report.period),
    deemedPercent: (params.report.summary as Pph21ReportSummary).dppPercent,
    withholderPlaceOfBusinessId: params.clinicNitku ?? '',
  };
  return {
    document: {
      withholderTin: params.clinicNpwp ?? '',
      lines: lines.map((line) =>
        toCoretaxLine({
          line,
          clinician: clinicians.get(line.doctorId) as CoretaxBp21ClinicianSource,
          context,
        }),
      ),
    },
    issues: [],
    skippedDoctorIds,
  };
}
