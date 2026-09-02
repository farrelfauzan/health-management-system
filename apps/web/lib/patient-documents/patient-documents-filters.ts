import type { DocumentCategoryValue } from '@hms/shared-types';

/**
 * What the Documents tab lets a clinician narrow the list by (FR-E2-04).
 * Every field is optional and every field only narrows: the patient is named
 * by the route and can never be widened from here. Dates are `YYYY-MM-DD`,
 * the same shape the `DatePicker` emits and the API validates.
 */
export type PatientDocumentsFilters = {
  category?: DocumentCategoryValue;
  documentDateFrom?: string;
  documentDateTo?: string;
};
