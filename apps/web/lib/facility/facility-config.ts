export type FacilityKind = 'clinic' | 'hospital';

export type FacilityConfig = {
  name: string;
  kind: FacilityKind;
};

export const FACILITY_KIND_LABELS: Record<FacilityKind, string> = {
  clinic: 'Klinik',
  hospital: 'Rumah Sakit',
};

export function getFacilityKindLabel(kind: FacilityKind, locale = 'id'): string {
  if (locale === 'en') {
    return kind === 'clinic' ? 'Clinic' : 'Hospital';
  }

  return FACILITY_KIND_LABELS[kind];
}

export const FACILITY_CONFIG: FacilityConfig = {
  name: 'Saling Jaga',
  kind: 'clinic',
};
