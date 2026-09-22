import { NON_CAPITATION_LABELS, NonCapitationRecapLine } from '@hms/shared-types';

import { NON_CAPITATION_FORMAT } from './format-non-capitation-values';

const UNPRICED = 'Tarif belum diatur';

function describeDocuments(line: NonCapitationRecapLine): string {
  return line.documents
    .map(
      (document) =>
        `${document.isPresent ? 'Ada' : 'BELUM ADA'}: ${NON_CAPITATION_LABELS.documentCategory[document.category] ?? document.category}`,
    )
    .join('; ');
}

/**
 * One recap line as printed cells, numbered from 1 (P25-T16). Participant,
 * service, date, tariff, status and the document checklist only — the D-033
 * billing-line opening; no diagnosis, finding or document content exists on
 * the line to print.
 */
export function buildNonCapitationLineCells(line: NonCapitationRecapLine, index: number): string[] {
  return [
    String(index + 1),
    NON_CAPITATION_FORMAT.date(line.serviceDate),
    line.patientName,
    line.bpjsNumberLast4 === null ? '-' : `****${line.bpjsNumberLast4}`,
    NON_CAPITATION_LABELS.serviceType[line.serviceType],
    line.visitLabel ?? '-',
    line.examinerProfession === null
      ? '-'
      : NON_CAPITATION_LABELS.profession[line.examinerProfession],
    line.tariffAmount === null ? UNPRICED : NON_CAPITATION_FORMAT.rupiah(line.tariffAmount),
    line.regulationReference ?? '-',
    describeDocuments(line),
    NON_CAPITATION_LABELS.status[line.status],
    NON_CAPITATION_FORMAT.date(line.expiresOn),
  ];
}
