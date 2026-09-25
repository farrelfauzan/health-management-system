export type ListSpecialtiesParams = {
  search?: string;
  isActive?: boolean;
};

export type SpecialtyRecord = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateSpecialtyRecordPayload = {
  name: string;
  description: string | null;
};

export type UpdateSpecialtyRecordPayload = {
  name?: string;
  description?: string | null;
  isActive?: boolean;
};

/**
 * What still depends on a poli, counted before it may be deactivated: active
 * clinician profiles practising under it and active tariffs priced for it.
 */
export type SpecialtyUsageCounts = {
  activeClinicianCount: number;
  activeTariffCount: number;
};
