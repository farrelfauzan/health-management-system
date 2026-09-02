import type { PatientDocumentControllerListDocumentsV1Params } from '#lib/api/generated/model/patientDocumentControllerListDocumentsV1Params';
import type { PatientDocumentsFilters } from '#lib/patient-documents/patient-documents-filters';

/**
 * Turns the tab's filter state into the query the API accepts, dropping any
 * field that is unset or blank. Blank matters: a cleared date picker emits
 * `''`, and sending it would fail the API's `YYYY-MM-DD` check rather than
 * mean "no lower bound".
 */
export function buildPatientDocumentsListParams(
  filters: PatientDocumentsFilters,
): PatientDocumentControllerListDocumentsV1Params {
  const params: PatientDocumentControllerListDocumentsV1Params = {};
  if (filters.category) {
    params.category = filters.category;
  }
  if (filters.documentDateFrom) {
    params.documentDateFrom = filters.documentDateFrom;
  }
  if (filters.documentDateTo) {
    params.documentDateTo = filters.documentDateTo;
  }
  return params;
}
