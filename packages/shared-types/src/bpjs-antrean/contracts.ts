import type { BpjsAntreanEnvironmentValue } from '#bpjs-antrean/schemas';

/**
 * Admin-facing view of the facility's Antrean Online bridging configuration.
 * Secrets are write-only: the view carries presence flags and last-4 display
 * values, never the secret itself — the stored values cannot be read back
 * through the API at all. The inbound username is not a secret and is shown
 * in full, because the admin has to check it against what BPJS agreed at UAT.
 */
export type BpjsAntreanConfigView = {
  id: string;
  environment: BpjsAntreanEnvironmentValue;
  consId: string;
  kdProviderPpk: string;
  hasSecretKey: boolean;
  secretKeyLast4: string;
  hasUserKey: boolean;
  userKeyLast4: string;
  inboundUsername: string | null;
  hasInboundPassword: boolean;
  isActive: boolean;
  lastTestedAt: string | null;
  lastTestResult: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Outcome of a test-connection call. A failed test is a successful HTTP
 * response — the endpoint reports the upstream outcome instead of erroring,
 * so the settings screen can render "gagal" states with the readable reason.
 */
export type BpjsAntreanConnectionTestResult = {
  isSuccessful: boolean;
  message: string;
  testedAt: string;
};

/**
 * One disagreement between HFIS and HMS (P14-T05).
 *
 * HFIS is the source of truth for what Mobile JKN renders — poli, doctors,
 * shifts and quota — and **HMS cannot write it**. So this is a report, never
 * a sync: the clinic fixes whichever system is wrong, in that system. §4.3 of
 * the evaluation is explicit that a sync would be the wrong shape here,
 * because HMS does not own what the member sees.
 *
 * Every finding names the side that is missing something, because the fix
 * differs: an HFIS-only poli is fixed in the Antrean Faskes portal or by
 * mapping it in HMS, while an HMS-only one usually means a mapping typo.
 */
export type BpjsAntreanDriftKind =
  /** HFIS lists a poli no HMS specialty is mapped to. */
  | 'POLI_ONLY_IN_HFIS'
  /** An HMS specialty is mapped to a poli code HFIS does not list. */
  | 'POLI_ONLY_IN_HMS'
  /** An HMS specialty carries no BPJS poli code at all. */
  | 'SPECIALTY_UNMAPPED'
  /** HFIS lists a doctor no HMS practitioner is mapped to. */
  | 'DOCTOR_ONLY_IN_HFIS'
  /** An HMS doctor is mapped to a code HFIS does not list. */
  | 'DOCTOR_ONLY_IN_HMS'
  /** An HMS doctor carries no BPJS kdDokter at all. */
  | 'DOCTOR_UNMAPPED'
  /**
   * A mapped doctor has no open session in the reconciliation window. This is
   * the finding that costs a patient something: Mobile JKN renders the shift
   * from HFIS and lets a member book into it, and the booking then fails on a
   * member who is already holding a screenshot of their queue number.
   */
  | 'NO_OPEN_SESSION';

export type BpjsAntreanDriftFinding = {
  kind: BpjsAntreanDriftKind;
  /** The BPJS code the finding is about, when there is one. */
  code: string | null;
  /** Readable subject — the poli or practitioner name, from whichever side has it. */
  subject: string;
  detail: string;
};

/**
 * The HFIS reconciliation report. `checkedAt` and the window bounds are
 * carried so the screen can say what was compared and when — a drift report
 * with no timestamp invites acting on a stale one.
 */
export type BpjsAntreanReconciliationReport = {
  checkedAt: string;
  windowFrom: string;
  windowTo: string;
  hfisPoliCount: number;
  hfisDoctorCount: number;
  findings: BpjsAntreanDriftFinding[];
};
