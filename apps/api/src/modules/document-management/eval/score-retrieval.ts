import {
  RetrievalEvalCase,
  RetrievalEvalCaseResult,
  RetrievalEvalObservation,
  RetrievalEvalReport,
} from './retrieval-eval.types';

/**
 * Scores one retrieval run into the §5.2 baseline metrics.
 *
 * Pure, and separate from collecting the observations, for the same reason
 * the tool-selection scorer is: the expensive half needs a live embedding
 * model and a seeded corpus, and keeping the arithmetic testable without
 * either means a captured run can be re-scored after the rubric changes
 * instead of being re-paid for.
 *
 * **Recall is the headline metric, and the choice is deliberate.** Retrieval
 * here feeds a generator rather than a search-results page: a passage ranked
 * third still reaches the model and can still ground the answer, where a
 * passage never retrieved cannot. Rank-first and MRR are reported alongside
 * because they say how much of the prompt budget is being spent to get there,
 * but a change that trades rank for recall is an improvement.
 *
 * **Cross-lingual cases are scored separately** because they are the entire
 * justification for choosing vectors over full-text alone (§5.2). An
 * aggregate that mixed them can hide a retriever that works only within a
 * language, which is precisely the failure the architecture was chosen to
 * avoid — and which would look like a merely mediocre overall score.
 */
export function scoreRetrieval(
  evalCases: readonly RetrievalEvalCase[],
  observations: readonly RetrievalEvalObservation[],
): RetrievalEvalReport {
  const observationsByCaseId = new Map(
    observations.map((observation) => [observation.caseId, observation]),
  );
  const results = evalCases.map((evalCase) =>
    scoreCase(evalCase, observationsByCaseId.get(evalCase.id)),
  );
  const crossLingual = results.filter((result) => result.isCrossLingual);
  const sameLanguage = results.filter((result) => !result.isCrossLingual);
  return {
    totalCases: results.length,
    recallRate: ratio(results.filter((result) => result.didRecall).length, results.length),
    rankFirstRate: ratio(results.filter((result) => result.didRankFirst).length, results.length),
    meanReciprocalRank: mean(results.map((result) => result.reciprocalRank)),
    crossLingualCaseCount: crossLingual.length,
    crossLingualRecallRate: ratio(
      crossLingual.filter((result) => result.didRecall).length,
      crossLingual.length,
    ),
    crossLingualMeanReciprocalRank: mean(crossLingual.map((result) => result.reciprocalRank)),
    sameLanguageRecallRate: ratio(
      sameLanguage.filter((result) => result.didRecall).length,
      sameLanguage.length,
    ),
    results,
  };
}

function scoreCase(
  evalCase: RetrievalEvalCase,
  observation: RetrievalEvalObservation | undefined,
): RetrievalEvalCaseResult {
  // A case with no observation scores as a miss rather than being skipped: a
  // run that silently lost a case must not score better than one that
  // retrieved nothing for it.
  const retrieved = observation?.retrievedDocumentKeys ?? [];
  const positions = evalCase.expectedDocumentKeys
    .map((key) => retrieved.indexOf(key))
    .filter((index) => index >= 0)
    .map((index) => index + 1);
  const bestRank = positions.length === 0 ? null : Math.min(...positions);
  return {
    caseId: evalCase.id,
    isCrossLingual: evalCase.isCrossLingual,
    didRecall: bestRank !== null,
    didRankFirst: bestRank === 1,
    bestRank,
    reciprocalRank: bestRank === null ? 0 : 1 / bestRank,
  };
}

/** An empty denominator reports 0 rather than NaN, so a report is printable. */
function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length;
}
