/**
 * The slice of a Zod schema this validator needs. Declared structurally so the
 * web app does not take a direct `zod` dependency — schemas arrive from
 * `@hms/shared-types` already built.
 */
type PatientFieldSchema = {
  safeParse(value: unknown):
    | { success: true }
    | { success: false; error: { issues: ReadonlyArray<{ message: string }> } };
};

type PatientFieldValidatorParams = {
  schema: PatientFieldSchema;
  allowBlank: boolean;
};

/**
 * Builds a field validator that either enforces the create schema or lets a
 * blank stand.
 *
 * Editing needs the second behaviour. A patient created from a chat draft
 * arrives with no birth date, sex or address — deliberately, because nobody
 * was there to ask (see `createChannelDraftPatientSchema`) — and the front desk
 * completes the record over later visits. `updatePatientSchema` accepts that
 * partial payload, so validating an edit against the required create schema
 * blocks the very save it exists to serve, with the field errors rendering far
 * enough down a scrolling dialog to look like a dead button.
 *
 * A blank therefore means "leave this alone" and the submit handler drops it;
 * anything the user actually typed is still checked, so a malformed date never
 * reaches the API. Always returns a function rather than passing the schema
 * through directly, which keeps one validator type across both modes.
 */
export function buildPatientFieldValidator({
  schema,
  allowBlank,
}: PatientFieldValidatorParams): (context: { value: string }) => string | undefined {
  return ({ value }: { value: string }): string | undefined => {
    if (allowBlank && value.trim() === '') {
      return undefined;
    }
    const result = schema.safeParse(value);
    return result.success ? undefined : result.error.issues[0]?.message;
  };
}
