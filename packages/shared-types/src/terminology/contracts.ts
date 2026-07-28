export type Icd10Code = {
  id: string;
  code: string;
  display: string;
  displayIndonesian?: string;
  category?: string;
  chapter?: string;
  isActive: boolean;
};

export type Icd9cmCode = {
  id: string;
  code: string;
  display: string;
  displayIndonesian?: string;
  category?: string;
  isActive: boolean;
};
