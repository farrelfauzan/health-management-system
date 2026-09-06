import { Decimal } from '../../../generated/prisma/internal/prismaNamespace';
import { LabResultTypeValue, LabSpecimenTypeValue } from '@hms/shared-types';

/**
 * Persistence-shaped rows for the laboratory catalog. `Decimal` is a Prisma
 * type and never leaves this layer, which is why these live in `apps/api`
 * rather than in `@hms/shared-types` — the documented exception for adapter
 * internals.
 */
export type LabReferenceRangeRow = {
  id: string;
  sex: 'MALE' | 'FEMALE' | null;
  ageMinDays: number | null;
  ageMaxDays: number | null;
  low: Decimal | null;
  high: Decimal | null;
  criticalLow: Decimal | null;
  criticalHigh: Decimal | null;
  textNormal: string | null;
};

export type LabTestRow = {
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
  serviceTariff: { price: Decimal } | null;
  referenceRanges: LabReferenceRangeRow[];
  createdAt: Date;
  updatedAt: Date;
};

export type LabPanelRow = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  serviceTariffId: string | null;
  serviceTariff: { price: Decimal } | null;
  members: Array<{
    labTestId: string;
    sortOrder: number;
    labTest: {
      code: string;
      name: string;
      specimenType: LabSpecimenTypeValue;
      resultType: LabResultTypeValue;
    };
  }>;
  createdAt: Date;
  updatedAt: Date;
};
