import type { InvoiceItemTypeValue, ServiceTariffCategoryValue } from '#billing/schemas';
import type {
  ClinicianFeeEntryKindValue,
  ClinicianFeeRuleLevelValue,
  ClinicianFeeRuleModeValue,
} from '#clinician-fee/schemas';
import type { ClinicianProfessionValue } from '#doctor-management/schemas';

/** A jasa medis rule as the resolver reads it. Dates are `YYYY-MM-DD`. */
export type ClinicianFeeRuleRecord = {
  id: string;
  serviceTariffId: string | null;
  category: ServiceTariffCategoryValue | null;
  doctorId: string | null;
  mode: ClinicianFeeRuleModeValue;
  value: number;
  effectiveFrom: string;
  effectiveTo: string | null;
};

/** A rule with the names the rule list shows. */
export type ClinicianFeeRuleDetailRecord = ClinicianFeeRuleRecord & {
  serviceTariff: { code: string; name: string; category: ServiceTariffCategoryValue } | null;
  doctor: { fullName: string; profession: ClinicianProfessionValue } | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ResolveClinicianFeeRuleParams = {
  rules: readonly ClinicianFeeRuleRecord[];
  doctorId: string;
  serviceTariffId: string | null;
  category: ServiceTariffCategoryValue | null;
  /** The clinic-local payment day, `YYYY-MM-DD`. */
  onDate: string;
};

export type ResolvedClinicianFeeRule = {
  rule: ClinicianFeeRuleRecord;
  level: ClinicianFeeRuleLevelValue;
};

export type ComputeClinicianFeeParams = {
  /** What the patient paid for the whole line, in rupiah. */
  lineAmount: number;
  quantity: number;
  mode: ClinicianFeeRuleModeValue;
  value: number;
};

/** The two shares of one line, in rupiah; they always add up to the line. */
export type ClinicianFeeShares = {
  grossFee: number;
  clinicShare: number;
};

export type ClinicianFeeRulePeriod = {
  effectiveFrom: string;
  effectiveTo: string | null;
};

export type HasOverlappingClinicianFeeRuleParams = {
  candidate: ClinicianFeeRulePeriod;
  existing: readonly ClinicianFeeRulePeriod[];
};

export type CreateClinicianFeeRulePayload = {
  serviceTariffId: string | null;
  category: ServiceTariffCategoryValue | null;
  doctorId: string | null;
  mode: ClinicianFeeRuleModeValue;
  value: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

export type UpdateClinicianFeeRulePayload = {
  id: string;
  mode: ClinicianFeeRuleModeValue;
  value: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

export type FindClinicianFeeRulesForTargetParams = {
  serviceTariffId: string | null;
  category: ServiceTariffCategoryValue | null;
  doctorId: string | null;
  excludeRuleId?: string;
};

export type FindClinicianFeeRuleTargetParams = {
  serviceTariffId: string | null;
  doctorId: string | null;
};

/** Whether a rule's tariff and clinician exist and are not deleted. */
export type ClinicianFeeRuleTargetState = {
  isTariffFound: boolean;
  isDoctorFound: boolean;
};

/** One paid line as the ledger reads it. */
export type ClinicianFeeLineRecord = {
  invoiceItemId: string;
  itemType: InvoiceItemTypeValue;
  serviceTariffId: string | null;
  tariffCategory: ServiceTariffCategoryValue | null;
  quantity: number;
  amount: number;
};

/**
 * A settled invoice and the clinician it is attributed to: the encounter's
 * clinician for an outpatient bill, the admitting doctor for a stay, none for a
 * walk-in lab visit.
 */
export type ClinicianFeeInvoiceRecord = {
  invoiceId: string;
  doctorId: string | null;
  lines: ClinicianFeeLineRecord[];
};

export type CreateClinicianFeeEntryPayload = {
  kind: ClinicianFeeEntryKindValue;
  invoiceId: string;
  invoiceItemId: string;
  doctorId: string;
  ruleId: string | null;
  ruleMode: ClinicianFeeRuleModeValue;
  ruleValue: number;
  lineAmount: number;
  grossFee: number;
  clinicShare: number;
  period: string;
  occurredAt: Date;
};

/** An accrual as stored, the input a reversal is built from. */
export type ClinicianFeeAccrualRecord = {
  invoiceItemId: string;
  doctorId: string;
  ruleId: string | null;
  ruleMode: ClinicianFeeRuleModeValue;
  ruleValue: number;
  lineAmount: number;
  grossFee: number;
  clinicShare: number;
};

export type BuildClinicianFeeAccrualParams = {
  invoiceId: string;
  doctorId: string;
  line: ClinicianFeeLineRecord;
  rules: readonly ClinicianFeeRuleRecord[];
  /** The clinic-local payment day, `YYYY-MM-DD`. */
  onDate: string;
  period: string;
  occurredAt: Date;
};

export type BuildClinicianFeeReversalParams = {
  invoiceId: string;
  accrual: ClinicianFeeAccrualRecord;
  period: string;
  occurredAt: Date;
};

/** The three signed amounts every ledger entry carries. */
export type ClinicianFeeShareAmounts = {
  lineAmount: number;
  grossFee: number;
  clinicShare: number;
};

export type RecordClinicianFeeAccrualsParams = {
  invoiceId: string;
  paidAt: Date;
};

export type RecordClinicianFeeReversalsParams = {
  invoiceId: string;
  voidedAt: Date;
};

export type FindClinicianFeeStatementEntriesParams = {
  doctorId: string;
  period: string;
};

/** One ledger line of a statement. */
export type ClinicianFeeStatementEntryRecord = {
  id: string;
  kind: ClinicianFeeEntryKindValue;
  invoiceId: string;
  invoiceNumber: string;
  description: string;
  itemType: InvoiceItemTypeValue;
  quantity: number;
  occurredAt: Date;
  ruleMode: ClinicianFeeRuleModeValue;
  ruleValue: number;
  lineAmount: number;
  grossFee: number;
  clinicShare: number;
};

export type ClinicianFeeClinicianRecord = {
  id: string;
  fullName: string;
  profession: ClinicianProfessionValue;
};

/** A clinician's summed ledger for one period. */
export type ClinicianFeePeriodTotalsRecord = {
  doctorId: string;
  entryCount: number;
  lineAmount: number;
  grossFee: number;
  clinicShare: number;
};

export type ClinicianFeeStatementCsvExport = {
  fileName: string;
  csv: string;
};
