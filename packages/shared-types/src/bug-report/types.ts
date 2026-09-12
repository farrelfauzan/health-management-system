/**
 * The kinds of sensitive data a bug report must never carry (P23-T07).
 *
 * The list is deliberately about *shapes the reporter can type*, not about
 * every category the DPA names: a diagnosis is sensitive too, but no regular
 * expression recognises one, and pretending otherwise would give the reporter
 * false confidence. What is listed here is what a machine can actually catch.
 */
export type SensitiveDataCategory =
  | 'NIK'
  | 'BPJS_NUMBER'
  | 'PHONE'
  | 'EMAIL'
  | 'MRN'
  | 'SECRET';

/**
 * One hit, as an offset range into the text that was scanned.
 *
 * **The matched value is deliberately absent, and must stay absent.** A
 * finding travels into API error responses, audit metadata and browser state;
 * if it carried the NIK it found, blocking the report would itself become the
 * leak it exists to prevent. The offsets let the dialog highlight the span
 * in text the browser already holds, which is the only place the value is
 * legitimately in memory.
 */
export type SensitiveDataFinding = {
  readonly category: SensitiveDataCategory;
  readonly start: number;
  readonly end: number;
};

/**
 * The deployment's medical-record-number format, when the caller knows it.
 *
 * Only the API passes this: the MRN prefix and width are server configuration
 * (`PATIENT_MRN_PREFIX`, `PATIENT_MRN_WIDTH`), and the browser has no business
 * learning them just to run a client-side convenience check. A report whose
 * only sensitive value is an MRN is therefore caught at the API, not in the
 * dialog — which is why `SENSITIVE_DATA_DETECTED` has to render on the field
 * when it comes back from the server (P23-T11).
 */
export type SensitiveDataMrnFormat = {
  readonly prefix: string;
  readonly width: number;
};

/** Options for {@link detectSensitiveData}. */
export type DetectSensitiveDataOptions = {
  readonly mrnFormat?: SensitiveDataMrnFormat;
};

/**
 * What the repository needs to insert one report (P23-T08).
 *
 * `reporterRole` is passed in rather than looked up, because the Bug Board
 * shows the role and the row is the historical record of who filed it: reading
 * it back from the account later would let a promotion rewrite old reports.
 */
export type CreateBugReportData = {
  readonly reporterUserId: string;
  readonly reporterRole: string;
  readonly title: string;
  readonly description: string;
  readonly stepsToReproduce?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly pagePath: string;
  readonly requestIds: readonly string[];
  readonly userAgent: string;
  readonly appVersion?: string;
  readonly acknowledgedNoSensitiveDataAt: Date;
};

/**
 * A stored report, projected to what callers outside the repository may see.
 *
 * Free text is deliberately not in this projection: intake answers with the
 * reference and the status, and the only consumer that needs the text is the
 * triage worker, which reads it through its own projection (P23-T09).
 */
export type BugReportRecord = {
  readonly id: string;
  readonly reference: string;
  readonly status: 'RECEIVED' | 'TRIAGED' | 'HELD' | 'PUBLISHED' | 'FAILED';
  readonly createdAt: Date;
};

/** The rolling window a reporter's daily limit is counted over. */
export type BugReportQuota = {
  readonly since: Date;
  readonly limit: number;
};
