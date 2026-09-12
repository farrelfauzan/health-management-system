import { z } from 'zod';
import { detectSensitiveData, SENSITIVE_DATA_DETECTED } from '#bug-report/detect-sensitive-data';
import { DetectSensitiveDataOptions } from '#bug-report/types';

const MAX_TITLE_LENGTH = 150;

const MAX_DESCRIPTION_LENGTH = 4000;

const MAX_OPTIONAL_TEXT_LENGTH = 2000;

const MAX_PAGE_PATH_LENGTH = 512;

/**
 * The longest `User-Agent` worth storing. Not a request field — the API reads
 * the header — but the truncation length belongs next to the other limits.
 */
export const MAX_BUG_REPORT_USER_AGENT_LENGTH = 512;

const MAX_APP_VERSION_LENGTH = 64;

/**
 * How many recent failed-request ids a report may carry.
 *
 * Five is the buffer the dialog keeps (P23-T11). The cap is enforced here as
 * well because the browser is not the only possible caller, and an unbounded
 * array is a way to smuggle free text past the field-level checks.
 */
export const MAX_BUG_REPORT_REQUEST_IDS = 5;

/**
 * The request-ID middleware's own format, so an id that could not have come
 * from this API is refused rather than stored.
 *
 * Mirrors `REQUEST_ID_PATTERN` in `common/observability/request-id.middleware.ts`.
 * Kept deliberately narrow: the field's purpose is to point at a log line, and
 * anything that is not id-shaped is either a mistake or prose.
 */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * The free-text fields, in the order a reporter fills them in.
 *
 * Named once because three separate things iterate them: the sensitive-data
 * refinement below, the redaction step before the AI call (P23-T09), and the
 * length-only audit metadata that must never carry the text itself.
 */
export const BUG_REPORT_TEXT_FIELDS = [
  'title',
  'description',
  'stepsToReproduce',
  'expected',
  'actual',
] as const;

/** One free-text field of a bug report. */
export type BugReportTextField = (typeof BUG_REPORT_TEXT_FIELDS)[number];

/**
 * Strips the parts of a route that carry data rather than context.
 *
 * A path says which screen broke, which is the useful half. A query string and
 * a hash say which record was on it, and on this product that is a patient —
 * `?patientId=…`, `?nik=…`, a search box's contents. Identifier-shaped segments
 * go the same way for the same reason, replaced with `:id` so
 * `/admin/patients/3f1a…/edit` still reads as the patient edit screen.
 *
 * Exported because the API applies it server-side: the browser sends a cleaned
 * path (P23-T11) and the API cleans it again rather than trusting that it did.
 */
export function cleanBugReportPagePath(rawPagePath: string): string {
  const [pathWithoutHash = ''] = rawPagePath.split('#');
  const [pathWithoutQuery = ''] = pathWithoutHash.split('?');
  return pathWithoutQuery
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi, '/:id')
    .replace(/\/\d{4,}(?=\/|$)/g, '/:id');
}

/**
 * An optional free-text box: absent, or text the reporter actually wrote.
 *
 * `.transform()` deliberately comes *before* `.optional()`. The other order
 * reads more naturally and is wrong: `nestjs-zod` infers OpenAPI optionality
 * from the outermost wrapper, so a transform applied last hides the `optional`
 * and the field is published in `required` — which makes Orval generate
 * `stepsToReproduce: string` and forces every caller to send all three boxes.
 * The empty-string collapse is what makes this necessary at all: a form posts
 * `''` for an untouched textarea, and storing that as a column value rather
 * than as "not filled in" is a different fact.
 */
const optionalText = z
  .string()
  .trim()
  .max(MAX_OPTIONAL_TEXT_LENGTH)
  .transform((value) => (value.length === 0 ? undefined : value))
  .optional();

const bugReportFieldsSchema = z.object({
  title: z.string().trim().min(1).max(MAX_TITLE_LENGTH),
  description: z.string().trim().min(1).max(MAX_DESCRIPTION_LENGTH),
  stepsToReproduce: optionalText,
  expected: optionalText,
  actual: optionalText,
  pagePath: z
    .string()
    .trim()
    .min(1)
    .max(MAX_PAGE_PATH_LENGTH)
    .transform(cleanBugReportPagePath),
  requestIds: z
    .array(z.string().trim().regex(REQUEST_ID_PATTERN))
    .max(MAX_BUG_REPORT_REQUEST_IDS)
    .default([]),
  appVersion: z.string().trim().max(MAX_APP_VERSION_LENGTH).optional(),
  /**
   * The confirmation tick, typed as `true` rather than `boolean`: a report that
   * arrives without it is refused by the schema, so "the reporter was warned"
   * is a fact the row can rely on rather than a default someone can forget.
   */
  acknowledgedNoSensitiveData: z.literal(true),
});

/**
 * Adds one `SENSITIVE_DATA_DETECTED` issue per offending field.
 *
 * The issue names the field and the category and stops there. It does not
 * include the matched text, the offsets, or a count — this message is rendered
 * to a reporter, written to an audit row and logged, and a validation error
 * that quotes the NIK it rejected leaks it into three places the report itself
 * never reached.
 *
 * One issue per field rather than per finding: the reporter's next action is to
 * re-read that box, and four issues on one field describe the same edit.
 */
function refineNoSensitiveData(
  payload: z.infer<typeof bugReportFieldsSchema>,
  context: z.RefinementCtx,
  options: DetectSensitiveDataOptions,
): void {
  for (const field of BUG_REPORT_TEXT_FIELDS) {
    const value = payload[field];
    if (value === undefined) {
      continue;
    }
    const [firstFinding] = detectSensitiveData(value, options);
    if (!firstFinding) {
      continue;
    }
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: [field],
      params: { code: SENSITIVE_DATA_DETECTED, category: firstFinding.category },
      message: `This field looks like it contains sensitive data (${firstFinding.category}). Please remove it and describe the problem without patient details.`,
    });
  }
}

/**
 * The request's shape, with no sensitive-data rules attached.
 *
 * This is what the API's DTO wraps, and the split is deliberate. The global
 * `ZodValidationPipe` reports every refinement failure as a generic
 * `BAD_REQUEST` with the reason buried in `errors[].params`, so a sensitive-data
 * block applied here would reach the reporter as "Validation failed" — and the
 * dialog has to branch on `SENSITIVE_DATA_DETECTED` to put the message on the
 * right field. The service therefore runs {@link createBugReportSchemaWith}
 * itself and raises the coded error, and it is also the only place that knows
 * this deployment's MRN format. Shape here, content there.
 */
export const bugReportShapeSchema = bugReportFieldsSchema;

/**
 * What the portal sends to file a bug report (P23-T08), sensitive-data rules
 * included.
 *
 * Used by the dialog (P23-T11) for the live check as the reporter types, and by
 * the service by way of {@link createBugReportSchemaWith}. Not used as the DTO —
 * see {@link bugReportShapeSchema} for why.
 */
export const createBugReportSchema = bugReportFieldsSchema.superRefine((payload, context) => {
  refineNoSensitiveData(payload, context, {});
});

/**
 * The same schema, told the deployment's MRN format.
 *
 * A factory because the format is server configuration read at runtime, and the
 * MRN rule is the one check the browser structurally cannot perform: it would
 * have to be told the prefix and width to do it, and those are not the
 * browser's to know. A report whose only sensitive value is an MRN therefore
 * fails at the API, which is why the dialog has to render a server-side
 * `SENSITIVE_DATA_DETECTED` on the named field (P23-T11).
 */
export function createBugReportSchemaWith(
  options: DetectSensitiveDataOptions,
): typeof createBugReportSchema {
  return bugReportFieldsSchema.superRefine((payload, context) => {
    refineNoSensitiveData(payload, context, options);
  });
}

/**
 * The validated body of a create-bug-report request.
 *
 * The *output* type: `requestIds` has a default and `pagePath` a transform, so
 * what a caller sends and what the service receives are not the same shape, and
 * the service only ever sees this one.
 */
export type CreateBugReportInput = z.output<typeof bugReportFieldsSchema>;
