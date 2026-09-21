import type { InvoiceItemTypeValue, ServiceTariffCategoryValue } from '#billing/schemas';
import type {
  ClinicianFeeEntryKindValue,
  ClinicianFeeRuleLevelValue,
  ClinicianFeeRuleModeValue,
} from '#clinician-fee/schemas';
import type { ClinicianProfessionValue } from '#doctor-management/schemas';

/**
 * A jasa medis rule (P27-T06). Exactly one of `serviceTariffId` and `category`
 * is set; without `doctorId` the rule is the clinic-wide default for its
 * target. `level` names where it sits in the precedence.
 */
export type ClinicianFeeRuleView = {
  id: string;
  level: ClinicianFeeRuleLevelValue;
  serviceTariffId?: string;
  serviceTariffCode?: string;
  serviceTariffName?: string;
  category?: ServiceTariffCategoryValue;
  doctorId?: string;
  doctorName?: string;
  doctorProfession?: ClinicianProfessionValue;
  mode: ClinicianFeeRuleModeValue;
  value: number;
  effectiveFrom: string;
  effectiveTo?: string;
  createdAt: string;
  updatedAt: string;
};

/** Sums over a set of ledger entries, in rupiah; reversals count negative. */
export type ClinicianFeeTotalsView = {
  entryCount: number;
  lineAmount: number;
  grossFee: number;
  clinicShare: number;
};

export type ClinicianFeeClinicianSummaryView = {
  doctorId: string;
  doctorName: string;
  profession: ClinicianProfessionValue;
  totals: ClinicianFeeTotalsView;
};

/** Every clinician with ledger entries in a month, and the month's totals. */
export type ClinicianFeePeriodSummaryView = {
  period: string;
  clinicians: ClinicianFeeClinicianSummaryView[];
  totals: ClinicianFeeTotalsView;
};

export type ClinicianFeeEntryView = {
  id: string;
  kind: ClinicianFeeEntryKindValue;
  invoiceId: string;
  invoiceNumber: string;
  description: string;
  itemType: InvoiceItemTypeValue;
  quantity: number;
  occurredAt: string;
  ruleMode: ClinicianFeeRuleModeValue;
  ruleValue: number;
  lineAmount: number;
  grossFee: number;
  clinicShare: number;
};

/** One clinician's monthly statement: every entry of the month and their sum. */
export type ClinicianFeeStatementView = {
  period: string;
  doctorId: string;
  doctorName: string;
  profession: ClinicianProfessionValue;
  totals: ClinicianFeeTotalsView;
  entries: ClinicianFeeEntryView[];
};
