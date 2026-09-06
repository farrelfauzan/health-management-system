import type {
  LabReferenceRangeInput,
  LabResultTypeValue,
  LabSpecimenTypeValue,
} from '#laboratory/schemas';

/** Repository query parameters for the catalog lists. */
export type ListLabTestsParams = {
  search?: string;
  active?: boolean;
};

export type ListLabPanelsParams = ListLabTestsParams;

export type LabReferenceRangeRecord = {
  id: string;
  sex: 'MALE' | 'FEMALE' | null;
  ageMinDays: number | null;
  ageMaxDays: number | null;
  low: number | null;
  high: number | null;
  criticalLow: number | null;
  criticalHigh: number | null;
  textNormal: string | null;
};

export type LabTestRecord = {
  id: string;
  code: string;
  name: string;
  loincCode: string | null;
  loincDisplay: string | null;
  specimenType: LabSpecimenTypeValue;
  resultType: LabResultTypeValue;
  unit: string | null;
  decimals: number;
  codedOptions: string[];
  isActive: boolean;
  serviceTariffId: string | null;
  price: number | null;
  referenceRanges: LabReferenceRangeRecord[];
  createdAt: Date;
  updatedAt: Date;
};

export type LabPanelMemberRecord = {
  labTestId: string;
  code: string;
  name: string;
  specimenType: LabSpecimenTypeValue;
  resultType: LabResultTypeValue;
  sortOrder: number;
};

export type LabPanelRecord = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  serviceTariffId: string | null;
  price: number | null;
  members: LabPanelMemberRecord[];
  createdAt: Date;
  updatedAt: Date;
};

export type CreateLabTestPayload = {
  code: string;
  name: string;
  loincCode: string | null;
  loincDisplay: string | null;
  specimenType: LabSpecimenTypeValue;
  resultType: LabResultTypeValue;
  unit: string | null;
  decimals: number;
  codedOptions: string[];
  isActive: boolean;
  serviceTariffId: string | null;
};

export type UpdateLabTestPayload = Partial<CreateLabTestPayload> & { id: string };

export type ReplaceLabReferenceRangesPayload = {
  labTestId: string;
  ranges: readonly LabReferenceRangeInput[];
};

export type CreateLabPanelPayload = {
  code: string;
  name: string;
  isActive: boolean;
  serviceTariffId: string | null;
  labTestIds: readonly string[];
};

export type UpdateLabPanelPayload = Partial<Omit<CreateLabPanelPayload, 'labTestIds'>> & {
  id: string;
  labTestIds?: readonly string[];
};
