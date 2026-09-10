/** The patient record strip's `?tab=` slugs, in strip order (SJ-162). */
export const PATIENT_DETAIL_TABS = ['overview', 'documents', 'laboratory'] as const;

export type PatientDetailTab = (typeof PATIENT_DETAIL_TABS)[number];
