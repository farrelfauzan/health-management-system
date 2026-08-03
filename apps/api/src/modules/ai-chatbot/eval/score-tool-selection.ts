import {
  ToolSelectionCaseOutcome,
  ToolSelectionCaseResult,
  ToolSelectionEvalCase,
  ToolSelectionEvalObservation,
  ToolSelectionEvalReport,
} from './tool-selection-eval.types';

/**
 * Phrases that mark a reply as a clarifying question rather than an answer.
 * Deliberately narrow — a question mark alone is not enough, since a model
 * that answers and then asks "anything else?" has not clarified anything.
 */
const CLARIFY_PATTERNS: readonly RegExp[] = [
  /\b(pasien|jadwal|obat)\s+(yang\s+)?mana\b/i,
  /\bbisa\s+(sebutkan|beri(kan)?)\s+(nama|id|tanggal)\b/i,
  /\bmaksud\s+(anda|kamu)\b.*\?/i,
  /\bwhich\s+(patient|appointment|medication|date)\b/i,
  /\b(could|can)\s+you\s+(specify|clarify|tell\s+me\s+which)\b/i,
  /\bdid\s+you\s+mean\b/i,
];

const EMPTY_COUNTS: Record<ToolSelectionCaseOutcome, number> = {
  CORRECT_TOOL: 0,
  WRONG_TOOL: 0,
  MISSED_TOOL: 0,
  FALSE_TOOL: 0,
  CORRECT_ABSTENTION: 0,
  CLARIFIED: 0,
};

/**
 * Scores one eval run into the five metrics of ai-chatbot-tools.md §4.7.3.
 *
 * A pure function over observations, deliberately: the expensive, flaky,
 * credential-requiring part is *collecting* the observations, and keeping the
 * scoring separate means the arithmetic is unit-testable without a provider,
 * a network, or a model. It also means a run captured once can be re-scored
 * after the rubric changes, instead of being re-paid for.
 *
 * The outcome taxonomy is what makes the metrics honest:
 *
 * - `CORRECT_TOOL` — expected a tool, got that tool.
 * - `WRONG_TOOL` — expected a tool, got a different one. Visible to the user
 *   in Mode A, because the rendered card names the tool (§4.7).
 * - `MISSED_TOOL` — expected a tool, got none. **The dangerous one** (§4.7.2):
 *   the reply answers from training data and nothing marks it.
 * - `FALSE_TOOL` — expected none, got one. Wasteful and occasionally wrong,
 *   but self-evident.
 * - `CORRECT_ABSTENTION` — expected none, got none, and the question was
 *   answerable.
 * - `CLARIFIED` — expected none on an *ambiguous* question, got none, and the
 *   reply asked which one. Counted as success, not failure.
 *
 * An ambiguous case that abstains without asking scores `CORRECT_ABSTENTION`
 * rather than `CLARIFIED`: it did the safe thing but left the user stuck, and
 * collapsing the two would hide that difference.
 */
export function scoreToolSelection(
  evalCases: readonly ToolSelectionEvalCase[],
  observations: readonly ToolSelectionEvalObservation[],
): ToolSelectionEvalReport {
  const observationsByCaseId = new Map(
    observations.map((observation) => [observation.caseId, observation]),
  );
  const results = evalCases.map((evalCase) =>
    scoreCase(evalCase, observationsByCaseId.get(evalCase.id)),
  );
  const counts = { ...EMPTY_COUNTS };
  for (const result of results) {
    counts[result.outcome] += 1;
  }
  const totalCases = results.length;
  const expectedToolCount = evalCases.filter((evalCase) => evalCase.expectedTool !== null).length;
  const expectedNoToolCount = totalCases - expectedToolCount;
  const ambiguousCount = evalCases.filter((evalCase) => evalCase.expectAmbiguous === true).length;
  const correctArgsEligible = results.filter((result) => result.outcome === 'CORRECT_TOOL');
  return {
    totalCases,
    // Denominators are the cases the metric is *about*, never the whole set:
    // dividing missed-tool by all cases would let a set with more negative
    // cases report a better score for identical behaviour.
    correctToolRate: ratio(counts.CORRECT_TOOL, expectedToolCount),
    correctArgsRate: ratio(
      correctArgsEligible.filter((result) => result.hasCorrectArguments).length,
      correctArgsEligible.length,
    ),
    falseToolRate: ratio(counts.FALSE_TOOL, expectedNoToolCount),
    missedToolRate: ratio(counts.MISSED_TOOL, expectedToolCount),
    clarifyRate: ratio(counts.CLARIFIED, ambiguousCount),
    counts,
    results,
  };
}

function scoreCase(
  evalCase: ToolSelectionEvalCase,
  observation: ToolSelectionEvalObservation | undefined,
): ToolSelectionCaseResult {
  // A case with no observation is scored as the worst outcome its expectation
  // allows rather than skipped. A run that silently dropped a case must not
  // score better than one that answered it badly.
  const calledTool = observation?.calledTool ?? null;
  if (evalCase.expectedTool === null) {
    if (calledTool !== null) {
      return { caseId: evalCase.id, outcome: 'FALSE_TOOL', hasCorrectArguments: false };
    }
    const didClarify =
      evalCase.expectAmbiguous === true && matchesClarify(observation?.replyText ?? '');
    return {
      caseId: evalCase.id,
      outcome: didClarify ? 'CLARIFIED' : 'CORRECT_ABSTENTION',
      hasCorrectArguments: false,
    };
  }
  if (calledTool === null) {
    return { caseId: evalCase.id, outcome: 'MISSED_TOOL', hasCorrectArguments: false };
  }
  if (calledTool !== evalCase.expectedTool) {
    return { caseId: evalCase.id, outcome: 'WRONG_TOOL', hasCorrectArguments: false };
  }
  return {
    caseId: evalCase.id,
    outcome: 'CORRECT_TOOL',
    hasCorrectArguments: hasExpectedArguments(evalCase, observation?.calledArguments ?? null),
  };
}

/**
 * Only the fields the case names are compared, and an expectation of `{}`
 * means "send nothing". A tool defaulting a field it was not given is correct
 * behaviour — the whole point of `list_my_appointments` omitting `date` for
 * today — so extra defaulted keys are not a mismatch, but an explicitly sent
 * value where none was wanted is.
 */
function hasExpectedArguments(
  evalCase: ToolSelectionEvalCase,
  calledArguments: Record<string, unknown> | null,
): boolean {
  if (evalCase.expectedArguments === undefined) {
    return true;
  }
  const called = calledArguments ?? {};
  const expectedEntries = Object.entries(evalCase.expectedArguments);
  if (expectedEntries.length === 0) {
    return Object.keys(called).length === 0;
  }
  return expectedEntries.every(
    ([key, value]) => JSON.stringify(called[key]) === JSON.stringify(value),
  );
}

function matchesClarify(replyText: string): boolean {
  return CLARIFY_PATTERNS.some((pattern) => pattern.test(replyText));
}

/** An empty denominator reports 0 rather than NaN, so a report is printable. */
function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}
