import type { LabResultTypeValue, LabSpecimenTypeValue } from '#laboratory/schemas';

/**
 * One reference range as the catalog renders it. Numbers rather than decimal
 * strings: the repository converts at the Prisma boundary so no `Decimal`
 * escapes into the domain, the same rule vital signs follow.
 */
export type LabReferenceRangeView = {
  id: string;
  sex?: 'MALE' | 'FEMALE';
  ageMinDays?: number;
  ageMaxDays?: number;
  low?: number;
  high?: number;
  criticalLow?: number;
  criticalHigh?: number;
  textNormal?: string;
};

export type LabTestView = {
  id: string;
  code: string;
  name: string;
  loincCode?: string;
  loincDisplay?: string;
  specimenType: LabSpecimenTypeValue;
  resultType: LabResultTypeValue;
  unit?: string;
  decimals: number;
  codedOptions: string[];
  isActive: boolean;
  serviceTariffId?: string;
  /** Rupiah, from the referenced LAB tariff. Absent when the test is unpriced. */
  price?: number;
  referenceRanges: LabReferenceRangeView[];
  createdAt: string;
  updatedAt: string;
};

/**
 * A panel member as the catalog lists it: enough to show the row and its
 * order, without repeating the member's full ranges — the test's own row
 * carries those.
 */
export type LabPanelMemberView = {
  labTestId: string;
  code: string;
  name: string;
  specimenType: LabSpecimenTypeValue;
  resultType: LabResultTypeValue;
  sortOrder: number;
};

export type LabPanelView = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  serviceTariffId?: string;
  price?: number;
  members: LabPanelMemberView[];
  createdAt: string;
  updatedAt: string;
};
