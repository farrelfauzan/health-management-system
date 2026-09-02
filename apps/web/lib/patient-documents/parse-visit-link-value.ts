import { VISIT_LINK_NONE } from '#lib/patient-documents/visit-link-value';

type ParsedVisitLink = {
  encounterId: string | undefined;
  admissionId: string | undefined;
};

const ENCOUNTER_PREFIX = 'encounter:';
const ADMISSION_PREFIX = 'admission:';

/**
 * The inverse of `formatVisitLinkValue`. Both ids come back `undefined` for
 * the sentinel and for anything unrecognised — an unrecognised value is
 * treated as "no link" rather than guessed at, because guessing wrong would
 * file a document under the wrong visit.
 */
export function parseVisitLinkValue(value: string): ParsedVisitLink {
  if (value === VISIT_LINK_NONE) {
    return { encounterId: undefined, admissionId: undefined };
  }
  if (value.startsWith(ENCOUNTER_PREFIX)) {
    return { encounterId: value.slice(ENCOUNTER_PREFIX.length), admissionId: undefined };
  }
  if (value.startsWith(ADMISSION_PREFIX)) {
    return { encounterId: undefined, admissionId: value.slice(ADMISSION_PREFIX.length) };
  }
  return { encounterId: undefined, admissionId: undefined };
}
