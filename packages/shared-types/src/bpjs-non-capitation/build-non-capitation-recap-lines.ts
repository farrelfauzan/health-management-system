import { addMonthsToCalendarDate } from '#bpjs-non-capitation/add-months-to-calendar-date';
import { checkNonCapitationDocuments } from '#bpjs-non-capitation/check-non-capitation-documents';
import { deriveNonCapitationUnits } from '#bpjs-non-capitation/derive-non-capitation-units';
import { resolveNonCapitationClaimStatus } from '#bpjs-non-capitation/resolve-non-capitation-claim-status';
import { resolveNonCapitationTariff } from '#bpjs-non-capitation/resolve-non-capitation-tariff';
import { NON_CAPITATION_EXPIRY_MONTHS } from '#bpjs-non-capitation/schemas';
import type { NonCapitationRecapLine } from '#bpjs-non-capitation/contracts';
import type {
  NonCapitationMarkSource,
  NonCapitationRecapClock,
  NonCapitationRecapSources,
  NonCapitationUnit,
} from '#bpjs-non-capitation/types';

function buildMarkKey(serviceType: string, sourceId: string): string {
  return `${serviceType}:${sourceId}`;
}

function indexMarks(marks: readonly NonCapitationMarkSource[]): Map<string, Date> {
  return new Map(
    marks.map((mark) => [buildMarkKey(mark.serviceType, mark.sourceId), mark.markedAt]),
  );
}

function compareLines(left: NonCapitationRecapLine, right: NonCapitationRecapLine): number {
  return (
    left.serviceDate.localeCompare(right.serviceDate) ||
    left.patientName.localeCompare(right.patientName, 'id') ||
    left.serviceType.localeCompare(right.serviceType)
  );
}

function toLine(params: {
  readonly unit: NonCapitationUnit;
  readonly sources: NonCapitationRecapSources;
  readonly clock: NonCapitationRecapClock;
  readonly markedAt: Date | null;
}): NonCapitationRecapLine {
  const { unit, sources, clock, markedAt } = params;
  const tariff = resolveNonCapitationTariff({
    tariffs: sources.tariffs,
    serviceType: unit.serviceType,
    serviceDate: unit.serviceDate,
  });
  const documents = checkNonCapitationDocuments(unit, sources.documents);
  const expiresOn = addMonthsToCalendarDate(unit.serviceDate, NON_CAPITATION_EXPIRY_MONTHS);
  return {
    serviceType: unit.serviceType,
    sourceId: unit.sourceId,
    serviceDate: unit.serviceDate,
    patientId: unit.patient.id,
    patientName: unit.patient.fullName,
    bpjsNumberLast4: unit.patient.bpjsNumberLast4,
    visitLabel: unit.visitLabel,
    examinerProfession: unit.examinerProfession,
    tariffAmount: tariff?.amount ?? null,
    regulationReference: tariff?.regulationReference ?? null,
    documents,
    isDocumentationComplete: documents.every((document) => document.isPresent),
    status: resolveNonCapitationClaimStatus({
      isMarked: markedAt !== null,
      today: clock.today,
      filingDeadline: clock.filingDeadline,
      expiresOn,
    }),
    markedAt: markedAt?.toISOString() ?? null,
    expiresOn,
  };
}

/**
 * The month's recap lines (P25-T16): every payable unit, priced at the
 * tariff valid on its date, checked against the filed document categories,
 * and given its claim status on `clock.today`. Ordered by date, then patient.
 */
export function buildNonCapitationRecapLines(
  sources: NonCapitationRecapSources,
  clock: NonCapitationRecapClock,
): NonCapitationRecapLine[] {
  const marks = indexMarks(sources.marks);
  return deriveNonCapitationUnits(sources, clock.timeZone)
    .map((unit) =>
      toLine({
        unit,
        sources,
        clock,
        markedAt: marks.get(buildMarkKey(unit.serviceType, unit.sourceId)) ?? null,
      }),
    )
    .sort(compareLines);
}
