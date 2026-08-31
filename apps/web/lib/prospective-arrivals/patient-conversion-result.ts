import type { ProspectiveArrivalResolutionView } from '@hms/shared-types';

/**
 * What the arrival drawer needs back once the form has registered somebody
 * (`P17-T04`).
 *
 * The warnings ride alongside the resolution rather than keeping the form
 * open, because by the time they exist the record is committed and its MRN is
 * spent. A form that stayed open on a warning would invite a second submit,
 * and a second submit is the duplicate record this flow exists to prevent — so
 * the warning is shown next to the allocated MRN instead, where the desk can
 * act on it through the patient-edit screen.
 */
export type PatientConversionResult = {
  resolution: ProspectiveArrivalResolutionView;
  identifierWarnings: string[];
};
