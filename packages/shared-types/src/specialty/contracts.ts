export type Specialty = {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SpecialtySummary = {
  id: string;
  name: string;
};

/** The `details` of a `SPECIALTY_IN_USE` refusal. */
export type SpecialtyInUseDetails = {
  activeClinicianCount: number;
  activeTariffCount: number;
};
