import type { KohortRegisterKindValue } from '#maternal-reporting/schemas';
import type {
  KohortRegisterRow,
  MaternalReportColumn,
  MaternalReportVillageOption,
} from '#maternal-reporting/types';

/** What every register and report prints above its table. */
export type MaternalReportHeader = {
  clinicName: string;
  puskesmasName: string | null;
  puskesmasCode: string | null;
  month: string;
  /** `Oktober 2026`, in the clinic's language. */
  monthLabel: string;
  generatedAt: string;
};

export type KohortRegisterGroup = {
  villageCode: string | null;
  /** The village name, or `Tanpa desa` for the rows without one. */
  villageName: string;
  rows: KohortRegisterRow[];
};

/** One kohort register for a month (P25-T15, FR-RPT-01). */
export type KohortRegisterResponse = {
  register: KohortRegisterKindValue;
  header: MaternalReportHeader;
  villageCode: string | null;
  /** Whether this layout still awaits the pilot puskesmas' form (Q11, D-040). */
  isProvisionalLayout: boolean;
  columns: MaternalReportColumn[];
  /** Every village that appears in the unfiltered month, for the picker. */
  villages: MaternalReportVillageOption[];
  groups: KohortRegisterGroup[];
  totalRows: number;
};

export type MonthlyKiaIndicatorValue = {
  id: string;
  label: string;
  definition: string;
  value: number;
};

/** The monthly KIA report (FR-RPT-02): indicator counts plus the LB3 lab block. */
export type MonthlyKiaReportResponse = {
  header: MaternalReportHeader;
  isProvisionalLayout: boolean;
  indicators: MonthlyKiaIndicatorValue[];
  antenatalLab: MonthlyKiaIndicatorValue[];
};

export type BirthsDeathsBirthRow = {
  id: string;
  birthAt: string;
  outcome: 'LIVE_BIRTH' | 'STILLBIRTH';
  sex: 'MALE' | 'FEMALE';
  birthWeightGrams: number | null;
  motherName: string;
  villageName: string | null;
  attendantName: string;
};

export type BirthsDeathsDeathRow = {
  id: string;
  diedAt: string;
  patientKind: 'MOTHER' | 'NEWBORN' | 'OTHER';
  patientName: string;
  ageLabel: string;
  villageName: string | null;
};

export type BirthsDeathsSummary = {
  liveBirths: number;
  stillbirths: number;
  maternalDeaths: number;
  newbornDeaths: number;
  otherDeaths: number;
};

/** The monthly birth and death report (FR-RPT-03, Permenkes 28/2017 Pasal 28(h)). */
export type BirthsDeathsReportResponse = {
  header: MaternalReportHeader;
  /** Deaths outside the clinic are not captured; the header says so. */
  coverageNote: string;
  summary: BirthsDeathsSummary;
  births: BirthsDeathsBirthRow[];
  deaths: BirthsDeathsDeathRow[];
};
