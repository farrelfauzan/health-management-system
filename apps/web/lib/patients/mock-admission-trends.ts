// DUMMY-DATA: the backend has no admissions aggregation contract yet. When a
// group-by-day admissions endpoint lands (e.g. GET /patients/admission-trends
// returning per-day counts), replace this module with generated hooks and
// delete the static series below.

export type AdmissionTrendPoint = {
  label: string;
  value: number;
};

export const MOCK_ADMISSION_TRENDS: AdmissionTrendPoint[] = [
  { label: 'Mon', value: 40 },
  { label: 'Tue', value: 60 },
  { label: 'Wed', value: 50 },
  { label: 'Thu', value: 80 },
  { label: 'Fri', value: 70 },
  { label: 'Sat', value: 95 },
];

export const MOCK_ADMISSION_TRENDS_SUMMARY = 'Occupancy is up 12% from last week.';
