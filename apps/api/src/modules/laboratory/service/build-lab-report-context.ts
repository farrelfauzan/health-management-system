import {
  ClinicProfileView,
  LabOrderRecord,
  LabReportRenderContext,
  LabResultFlagValue,
  LabResultRecord,
  LabWorklistPatientRecord,
} from '@hms/shared-types';

import { formatIndonesianDateTime } from './format-indonesian-date-time';
import { formatLabReportNumber } from './format-lab-report-number';
import { toPatientAgeYears } from './to-patient-age-years';

const SEX_LABELS: Readonly<Record<string, string>> = {
  MALE: 'Laki-laki',
  FEMALE: 'Perempuan',
};

/**
 * ▲ high, ▼ low, doubled when critical, * for a non-numeric abnormal. Marks
 * rather than colours: the sheet is photocopied and faxed, and a mark
 * survives both.
 */
const FLAG_MARKERS: Readonly<Record<LabResultFlagValue, string>> = {
  NORMAL: '',
  LOW: '▼',
  HIGH: '▲',
  CRITICAL_LOW: '▼▼',
  CRITICAL_HIGH: '▲▲',
  ABNORMAL: '*',
};

const NO_RANGE_LABEL = '-';

const RANGE_SEPARATOR = ' – ';

const ACCESSION_SEPARATOR = ', ';

type BuildLabReportContextParams = {
  order: LabOrderRecord;
  patient: LabWorklistPatientRecord;
  /** Every version of every result on the order; the builder keeps the current one per test. */
  results: readonly LabResultRecord[];
  clinic: ClinicProfileView | null;
  clinicLogoDataUri: string | null;
  verifierName: string;
  releasedAt: Date;
  /** The release this version replaces, when it is an amendment. */
  supersededReleasedAt: Date | null;
  timeZone: string;
};

/**
 * Gathers everything the hasil laboratorium prints (P18-T05).
 *
 * In the laboratory module, not the renderer, for the reason the surat
 * pengantar's context is: what a result means — which version is current,
 * which band it was judged against, what its flag says — is this module's
 * knowledge. Every value is formatted here, in Indonesian, and the renderer
 * places strings.
 *
 * The band printed is the one snapshotted on the row at entry, never the
 * catalog's current one: a range edited next year must not change what this
 * sheet says the patient was judged against.
 */
export function buildLabReportContext(params: BuildLabReportContextParams): LabReportRenderContext {
  const { order, patient, clinic, clinicLogoDataUri, verifierName, releasedAt, timeZone } = params;
  const current = pickCurrentResults(params.results);
  const specimens = order.specimens.filter((specimen) => specimen.status !== 'REJECTED');
  const collectedAt = specimens
    .map((specimen) => specimen.collectedAt)
    .sort((left, right) => left.getTime() - right.getTime())[0];
  const lines = order.items
    .filter((item) => item.status !== 'CANCELLED')
    .map((item, index) => {
      const result = current.get(item.id);
      return {
        'result.no': String(index + 1),
        'result.test': item.name,
        'result.value': result ? formatValue(result) : '',
        'result.unit': result?.unit ?? '',
        'result.flag': result?.flag ? FLAG_MARKERS[result.flag] : '',
        'result.referenceRange': result ? formatReferenceRange(result) : NO_RANGE_LABEL,
      };
    });

  return {
    title: buildTitle(order.orderNumber, params.supersededReleasedAt !== null),
    values: {
      'clinic.name': clinic?.name ?? '',
      'clinic.legalName': clinic?.legalName ?? '',
      'clinic.address': clinic?.address ?? '',
      'clinic.phone': clinic?.phoneNumber ?? '',
      'clinic.email': clinic?.email ?? '',
      'clinic.licenseNumber': clinic?.licenseNumber ?? '',
      'clinic.taxId': clinic?.taxId ?? '',
      'clinic.logo': clinicLogoDataUri ?? '',
      'patient.fullName': patient.fullName,
      'patient.mrn': patient.mrn,
      'patient.dateOfBirth': formatIndonesianDateTime({
        value: patient.dateOfBirth,
        timeZone: 'UTC',
        withTime: false,
      }),
      'patient.sex': SEX_LABELS[patient.sex] ?? '',
      'patient.age': `${toPatientAgeYears(patient.dateOfBirth, releasedAt)} tahun`,
      'order.number': order.orderNumber,
      'order.orderedAt': formatIndonesianDateTime({
        value: order.orderedAt,
        timeZone,
        withTime: false,
      }),
      'doctor.fullName': order.orderedByName,
      'specimen.accessionNumbers': specimens
        .map((specimen) => specimen.accessionNumber)
        .join(ACCESSION_SEPARATOR),
      'specimen.collectedAt': collectedAt
        ? formatIndonesianDateTime({ value: collectedAt, timeZone, withTime: true })
        : '',
      'report.releasedAt': formatIndonesianDateTime({ value: releasedAt, timeZone, withTime: true }),
      'report.verifierName': verifierName,
      'report.amendmentNotice':
        params.supersededReleasedAt === null
          ? ''
          : `AMENDED — menggantikan laporan tanggal ${formatIndonesianDateTime({
              value: params.supersededReleasedAt,
              timeZone,
              withTime: true,
            })}`,
    },
    lines,
  };
}

/** The highest version per item is the value the record holds. */
function pickCurrentResults(results: readonly LabResultRecord[]): Map<string, LabResultRecord> {
  const current = new Map<string, LabResultRecord>();
  for (const result of results) {
    const existing = current.get(result.labOrderItemId);
    if (!existing || existing.version < result.version) {
      current.set(result.labOrderItemId, result);
    }
  }
  return current;
}

function formatValue(result: LabResultRecord): string {
  if (result.valueNumeric !== null) {
    return formatLabReportNumber(result.valueNumeric);
  }
  return result.valueCoded ?? result.valueText ?? '';
}

/**
 * "12,0 – 16,0", "≥ 12" when only one edge applied, the normal text for a
 * coded or prose test, and a dash when no band applied to this patient —
 * printed as a dash rather than left blank, so "tidak ada rentang rujukan"
 * reads as a fact and not as a missing cell.
 */
function formatReferenceRange(result: LabResultRecord): string {
  if (result.refLow !== null && result.refHigh !== null) {
    return `${formatLabReportNumber(result.refLow)}${RANGE_SEPARATOR}${formatLabReportNumber(result.refHigh)}`;
  }
  if (result.refLow !== null) {
    return `≥ ${formatLabReportNumber(result.refLow)}`;
  }
  if (result.refHigh !== null) {
    return `≤ ${formatLabReportNumber(result.refHigh)}`;
  }
  return result.refText ?? NO_RANGE_LABEL;
}

function buildTitle(orderNumber: string, isAmended: boolean): string {
  return isAmended
    ? `Hasil laboratorium ${orderNumber} (revisi)`
    : `Hasil laboratorium ${orderNumber}`;
}
