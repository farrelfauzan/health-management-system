/** The patients page strip's `?tab=` slugs, in strip order (SJ-162, SJ-165). */
export const PATIENTS_TABS = ['directory', 'from-chat'] as const;

export type PatientsTab = (typeof PATIENTS_TABS)[number];
