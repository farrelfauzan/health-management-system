export type SearchIcd10CodesParams = {
  search?: string;
  category?: string;
  isActive?: boolean;
  limit: number;
};

export type Icd10CodeRecord = {
  id: string;
  code: string;
  display: string;
  displayIndonesian: string | null;
  category: string | null;
  chapter: string | null;
  isActive: boolean;
};
