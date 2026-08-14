const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The patient a denied tool call was reaching for, when it named one (SJ-14 §5).
 *
 * Filing the denial under that id is what puts the attempt in *that patient's*
 * access history, which is the history a person actually asks to see. Without
 * it the row would only be findable by knowing which doctor to suspect.
 *
 * The arguments are model-produced and were not necessarily validated — a
 * denial can happen before the schema runs — so this reads defensively and
 * demands a UUID. The column is `uuid`: a hallucinated `"the patient"` would
 * abort the insert and lose the audit row entirely, which is a worse outcome
 * than an unattributed one. An id that no patient owns is still recorded,
 * because "someone went looking for this" is the fact being logged.
 */
export function resolveToolCallPatientId(toolArguments: unknown): string | null {
  if (typeof toolArguments !== 'object' || toolArguments === null) {
    return null;
  }
  const candidate = (toolArguments as Record<string, unknown>).patientId;
  return typeof candidate === 'string' && UUID_PATTERN.test(candidate) ? candidate : null;
}
