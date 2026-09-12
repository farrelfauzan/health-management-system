import {
  BPJS_NUMBER_LENGTH,
  NIK_LENGTH,
  normaliseIdentifierDigits,
} from '#patient-management/schemas';
import {
  DetectSensitiveDataOptions,
  SensitiveDataCategory,
  SensitiveDataFinding,
  SensitiveDataMrnFormat,
} from '#bug-report/types';

/**
 * The error code both the API and the dialog use when a report is refused for
 * carrying sensitive data (P23-T07).
 *
 * Exported as a constant rather than spelled as a string at each call site so
 * the browser can compare a server error against the same token the server
 * raised.
 */
export const SENSITIVE_DATA_DETECTED = 'SENSITIVE_DATA_DETECTED';

/**
 * A run of digits, optionally broken by single spaces, dots or dashes.
 *
 * Separators are matched *between* digits only, never leading or trailing, so a
 * finding's end offset lands on a digit and highlighting the match does not
 * select the punctuation after it. Written `\d(?:[ .-]?\d)*` rather than
 * `[\d .-]+` for the same reason: the latter happily swallows
 * `2026-09-11 10:30` as one twelve-digit run.
 */
const DIGIT_RUN_PATTERN = /\d(?:[ .-]?\d)*/g;

/**
 * Indonesian phone numbers as a reporter types them: `+62…`, `62…` or `08…`,
 * then eight to eleven more digits with optional separators.
 *
 * The separator after the country code is optional and easy to forget — a
 * reporter writes `+62 812-3456-7890` far more often than `+62812…`, and a
 * pattern demanding the `8` immediately after `+62` silently misses the common
 * spelling. It then reads as a thirteen-digit run, which is a BPJS number's
 * length, so the miss does not merely lose the finding: it mislabels it.
 *
 * Deliberately not built on `normalizePhoneNumber`: that canonicalises a string
 * already known to be a phone number, whereas this has to *find* one inside
 * prose. The two agree on what Indonesian numbers look like, and the digit
 * bounds here are the same eight-to-thirteen-digit national part.
 */
const PHONE_PATTERN = /(?:(?:\+62|\b62)[ .-]?|\b0)8(?:[ .-]?\d){7,11}\b/g;

/**
 * Email addresses, matched loosely on purpose.
 *
 * A permissive pattern over prose beats a strict RFC one: matching something
 * that is not quite an address costs one false alarm the reporter edits away,
 * and missing a real one costs a leak.
 */
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** JWTs — three base64url segments, and the `eyJ` header is unmistakable. */
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g;

/** `Authorization: Bearer …` and bare bearer tokens. */
const BEARER_TOKEN_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi;

/**
 * Vendor API keys with a recognisable prefix (`sk-`, `pk_live_`, `ghp_`, …).
 *
 * Prefix-anchored rather than entropy-based: a high-entropy run is also what a
 * request id, a hash and a base64 fragment look like, and a detector that flags
 * all of those teaches reporters to ignore it.
 */
const PREFIXED_API_KEY_PATTERN =
  /\b(?:sk|pk|rk|ak|api|key|tok|ghp|gho|ghs|github_pat|xox[abposr]|AIza|ASIA|AKIA)[-_][A-Za-z0-9_-]{16,}/gi;

/**
 * `password: hunter2`, `kata sandi = …`, `token: …` and friends.
 *
 * The value side runs to the next whitespace, because a password is not
 * required to look like anything in particular — which is exactly why the key
 * is the only reliable signal.
 */
const CREDENTIAL_ASSIGNMENT_PATTERN =
  /\b(?:password|passwd|pwd|kata\s?sandi|sandi|secret|token|api[\s_-]?key|kunci)\b\s*[:=]\s*\S+/gi;

/**
 * Text that owns a long digit run for a reason other than being an identifier.
 *
 * Each of these would otherwise read as a long number: an ISO timestamp
 * contributes fourteen digits, a version string three, a UUID request id
 * thirty-two once its dashes are stripped. Blanking them before the digit scan
 * is what keeps the "should not match" half of the spec true, and it is a far
 * smaller rule set than teaching every numeric detector what a date looks like.
 *
 * Ordering matters: the version rule (`1.2.3`) also describes a dotted NIK
 * (`3171.0123.4567.8901`), so anything whose digits *are* an identifier must be
 * length-checked before these run. {@link detectSensitiveData} does that by
 * scanning for identifiers in a copy where only the ranges already claimed by a
 * more specific category are blanked, and consulting this list separately.
 */
const NON_IDENTIFIER_PATTERNS: readonly RegExp[] = [
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
  /\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/g,
  /\b\d{1,2}:\d{2}(?::\d{2})?\b/g,
  /\bv?\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.]+)?\b/g,
  /\b[A-Z]{2,5}\/\d{6,8}\/\d{2,6}\b/g,
];

/**
 * The fixed-length numeric identifiers, paired with what to call them.
 *
 * Both lengths come from the patient registry rather than being written out
 * here, so a change to either is a change in one place.
 */
const DIGIT_IDENTIFIER_RULES: readonly {
  readonly length: number;
  readonly category: SensitiveDataCategory;
}[] = [
  { length: NIK_LENGTH, category: 'NIK' },
  { length: BPJS_NUMBER_LENGTH, category: 'BPJS_NUMBER' },
];

/**
 * The stand-in written over masked spans.
 *
 * No pattern in this file matches it, so masking can never create a match the
 * original text did not contain. Written as an escape rather than a literal
 * control character: a raw NUL byte in the source makes `grep` call the file
 * binary and refuse to search it.
 */
const MASK_CHARACTER = String.fromCharCode(0);

const MRN_MINIMUM_PREFIX_LENGTH = 1;

const REGEX_METACHARACTER_PATTERN = /[.*+?^${}()|[\]\\]/g;

/**
 * Replaces every match with an equal-length run of {@link MASK_CHARACTER}, so
 * offsets in the masked copy still address the original string.
 */
function maskMatches(text: string, pattern: RegExp): string {
  return text.replace(pattern, (match) => MASK_CHARACTER.repeat(match.length));
}

/**
 * The spans covered by {@link NON_IDENTIFIER_PATTERNS}, as offset ranges.
 *
 * Returned as ranges rather than applied as a mask so a digit run can be judged
 * against them *after* its length is known. Blanking first would destroy a
 * dotted NIK, which the version rule matches perfectly well.
 */
function findNonIdentifierRanges(text: string): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  for (const pattern of NON_IDENTIFIER_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const index = match.index;
      if (index === undefined) {
        continue;
      }
      ranges.push({ start: index, end: index + match[0].length });
    }
  }
  return ranges;
}

/**
 * Finds fixed-length identifier numbers (NIK, BPJS) in a scannable copy.
 *
 * Length is compared after {@link normaliseIdentifierDigits}, the same
 * normaliser the patient registry writes through, so `3171 0123 4567 8901` and
 * `3171012345678901` are one NIK rather than a match and a miss. The comparison
 * is exact rather than "at least": a seventeen-digit run is not a NIK, and
 * calling it one would put the finding on the wrong span.
 *
 * A run is dismissed only when it sits *wholly inside* a non-identifier match,
 * which is the case for the digits of a timestamp or a version but not for a
 * dotted NIK — that one merely looks like a version to the regular expression,
 * and its length settles the argument.
 */
function findDigitIdentifiers(
  scannableText: string,
  length: number,
  category: SensitiveDataCategory,
  nonIdentifierRanges: readonly { start: number; end: number }[],
): SensitiveDataFinding[] {
  const findings: SensitiveDataFinding[] = [];
  for (const match of scannableText.matchAll(DIGIT_RUN_PATTERN)) {
    const matchedRun = match[0];
    const index = match.index;
    if (index === undefined) {
      continue;
    }
    if (normaliseIdentifierDigits(matchedRun).length !== length) {
      continue;
    }
    const end = index + matchedRun.length;
    const isExplainedByOtherText = nonIdentifierRanges.some(
      (range) => range.start <= index && range.end >= end,
    );
    if (!isExplainedByOtherText) {
      findings.push({ category, start: index, end });
    }
  }
  return findings;
}

/**
 * Blanks the spans another category already claimed, so the digit scan never
 * re-reports them under a second name.
 *
 * `+62 812-3456-7890` is thirteen digits, which is also the length of a BPJS
 * number; without this the same span would be reported twice, and
 * {@link collapseContainedFindings} could not tell which reading was right
 * because neither contains the other.
 */
function maskClaimedRanges(text: string, findings: readonly SensitiveDataFinding[]): string {
  return findings.reduce(
    (masked, finding) =>
      masked.slice(0, finding.start) +
      MASK_CHARACTER.repeat(finding.end - finding.start) +
      masked.slice(finding.end),
    text,
  );
}

/**
 * Builds the MRN pattern for one deployment's format.
 *
 * A blank prefix — the `PATIENT_MRN_PREFIX` default — makes this unsafe to run:
 * without it the rule is "any N-digit number", which at the default width of
 * eight would flag every eight-digit number a reporter mentions. Such a
 * deployment gets no MRN rule; the other categories still apply.
 */
function buildMrnPattern(mrnFormat: SensitiveDataMrnFormat): RegExp | null {
  const prefix = mrnFormat.prefix.trim();
  if (prefix.length < MRN_MINIMUM_PREFIX_LENGTH) {
    return null;
  }
  const escapedPrefix = prefix.replace(REGEX_METACHARACTER_PATTERN, '\\$&');
  return new RegExp(`${escapedPrefix}[ .-]?\\d{${mrnFormat.width}}`, 'gi');
}

/** Collects every match of one pattern as findings of one category. */
function findPatternMatches(
  text: string,
  pattern: RegExp,
  category: SensitiveDataCategory,
): SensitiveDataFinding[] {
  const findings: SensitiveDataFinding[] = [];
  for (const match of text.matchAll(pattern)) {
    const index = match.index;
    if (index === undefined) {
      continue;
    }
    findings.push({ category, start: index, end: index + match[0].length });
  }
  return findings;
}

/**
 * Orders findings and drops any wholly contained in an earlier one.
 *
 * Overlaps are normal rather than exceptional: `password: 08123456789` is a
 * SECRET whose value is also a PHONE, and a JWT payload contains runs an
 * API-key rule likes. Reporting the widest span once tells the reporter to
 * delete the whole thing, which is the edit that actually fixes it; listing the
 * fragments too would make one edit look like four problems. Partial overlaps
 * are both kept — neither covers the other, so neither edit alone suffices.
 */
function collapseContainedFindings(
  findings: readonly SensitiveDataFinding[],
): SensitiveDataFinding[] {
  const ordered = [...findings].sort(
    (left, right) => left.start - right.start || right.end - left.end,
  );
  const kept: SensitiveDataFinding[] = [];
  for (const finding of ordered) {
    const isContained = kept.some(
      (existing) => existing.start <= finding.start && existing.end >= finding.end,
    );
    if (!isContained) {
      kept.push(finding);
    }
  }
  return kept;
}

/**
 * The single rule set that decides whether a reporter's free text may leave the
 * clinic (P23-T07).
 *
 * Called in two places that must never disagree: the report dialog as the
 * reporter types (P23-T11), and the intake API, which is what actually enforces
 * it (P23-T08). The browser copy is a convenience — a reporter with developer
 * tools can defeat it — so the API runs this identical function on the same
 * text rather than trusting a client-side "already checked" flag.
 *
 * Offsets index the string as given. The caller receives spans and categories,
 * never the matched text: see {@link SensitiveDataFinding}.
 */
export function detectSensitiveData(
  text: string,
  options: DetectSensitiveDataOptions = {},
): SensitiveDataFinding[] {
  if (text.length === 0) {
    return [];
  }
  const secretFindings = [
    ...findPatternMatches(text, JWT_PATTERN, 'SECRET'),
    ...findPatternMatches(text, BEARER_TOKEN_PATTERN, 'SECRET'),
    ...findPatternMatches(text, PREFIXED_API_KEY_PATTERN, 'SECRET'),
    ...findPatternMatches(text, CREDENTIAL_ASSIGNMENT_PATTERN, 'SECRET'),
  ];
  const emailFindings = findPatternMatches(text, EMAIL_PATTERN, 'EMAIL');
  const mrnPattern = options.mrnFormat ? buildMrnPattern(options.mrnFormat) : null;
  const mrnFindings = mrnPattern ? findPatternMatches(text, mrnPattern, 'MRN') : [];
  const emailMaskedText = maskMatches(text, EMAIL_PATTERN);
  const phoneFindings = findPatternMatches(emailMaskedText, PHONE_PATTERN, 'PHONE');
  const claimedFindings = [...secretFindings, ...emailFindings, ...mrnFindings, ...phoneFindings];
  const scannableText = maskClaimedRanges(text, claimedFindings);
  const nonIdentifierRanges = findNonIdentifierRanges(scannableText);
  return collapseContainedFindings([
    ...claimedFindings,
    ...DIGIT_IDENTIFIER_RULES.flatMap((rule) =>
      findDigitIdentifiers(scannableText, rule.length, rule.category, nonIdentifierRanges),
    ),
  ]);
}
