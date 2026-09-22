import type { DocumentCategoryValue } from '#document-management/schemas';
import type {
  NonCapitationClaimStatusValue,
  NonCapitationServiceTypeValue,
} from '#bpjs-non-capitation/schemas';
import type {
  NonCapitationExaminerProfession,
  NonCapitationStatusCounts,
} from '#bpjs-non-capitation/types';

/** The induk FKTP settings as the panel reads them (P25-T16, D-043). */
export type NonCapitationSettingsView = {
  networkParentProviderCode: string | null;
  networkParentProviderName: string | null;
  isNetworkParentGovernmentOwned: boolean | null;
  hasOwnEclaimLogin: boolean | null;
  filingDayOfMonth: number;
  /** Both the induk's code and name are set. */
  isConfigured: boolean;
  updatedAt: string | null;
};

export type NonCapitationTariffView = {
  id: string;
  serviceType: NonCapitationServiceTypeValue;
  amount: number;
  /** `YYYY-MM-DD`. */
  validFrom: string;
  validUntil: string | null;
  regulationReference: string;
};

/** Whether a document of one required category is filed for the line. */
export type NonCapitationDocumentCheck = {
  category: DocumentCategoryValue;
  isPresent: boolean;
};

/**
 * One payable unit of the recap (P25-T16), shaped like the eClaim entry.
 * D-033's billing-line opening: participant, service type, date, tariff and
 * claim status, plus whether a document of each required category is filed.
 * Never a diagnosis, a finding or a document's content.
 */
export type NonCapitationRecapLine = {
  serviceType: NonCapitationServiceTypeValue;
  sourceId: string;
  /** `YYYY-MM-DD` in the clinic's timezone. */
  serviceDate: string;
  patientId: string;
  patientName: string;
  bpjsNumberLast4: string | null;
  /** The K or KF code of the visit, when it has one. */
  visitLabel: string | null;
  examinerProfession: NonCapitationExaminerProfession | null;
  /** Null when no tariff row is valid on the service date. */
  tariffAmount: number | null;
  regulationReference: string | null;
  documents: NonCapitationDocumentCheck[];
  isDocumentationComplete: boolean;
  status: NonCapitationClaimStatusValue;
  markedAt: string | null;
  /** `YYYY-MM-DD`: six months after the service (Perpres 82/2018 Pasal 77). */
  expiresOn: string;
};

export type NonCapitationRecapSummaryItem = {
  serviceType: NonCapitationServiceTypeValue;
  count: number;
  totalAmount: number;
};

export type NonCapitationRecapResponse = {
  month: string;
  /** `Oktober 2026`. */
  monthLabel: string;
  clinicName: string;
  generatedAt: string;
  settings: NonCapitationSettingsView;
  /** `YYYY-MM-DD`: the induk's filing date for this month. */
  filingDeadline: string;
  /** Negative once the date has passed. */
  daysUntilFilingDeadline: number;
  lines: NonCapitationRecapLine[];
  summary: NonCapitationRecapSummaryItem[];
  totalAmount: number;
  /** Lines with no valid tariff on their date; they are left out of the total. */
  unpricedCount: number;
  statusCounts: NonCapitationStatusCounts;
  /**
   * The most a non-government induk may keep as biaya pembinaan, 10% of the
   * total (Permenkes 28/2014 lampiran p. 39). Null when the induk is
   * government-owned (it pays the bidan in full) or its ownership is unknown.
   */
  maximumCoachingFeeAmount: number | null;
};

export type NonCapitationMarkOutcome = 'MARKED' | 'ALREADY_MARKED' | 'NOT_IN_RECAP';

export type NonCapitationMarkItemResult = {
  serviceType: NonCapitationServiceTypeValue;
  sourceId: string;
  outcome: NonCapitationMarkOutcome;
};

export type NonCapitationMarkResponse = {
  month: string;
  markedCount: number;
  results: NonCapitationMarkItemResult[];
};
