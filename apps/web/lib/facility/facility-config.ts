export type FacilityKind = 'clinic' | 'hospital';

export type FacilityConfig = {
  name: string;
  kind: FacilityKind;
};

export const FACILITY_KIND_LABELS: Record<FacilityKind, string> = {
  clinic: 'Clinic',
  hospital: 'Hospital',
};

export const FACILITY_CONFIG: FacilityConfig = {
  name: 'Saling Jaga',
  kind: 'clinic',
};
