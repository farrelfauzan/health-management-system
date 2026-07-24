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
