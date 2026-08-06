import {
  FaqEvalDocument,
  FaqRetrievalCaseOutcome,
  FaqRetrievalCaseResult,
  FaqRetrievalEvalCase,
  FaqRetrievalEvalObservation,
  FaqRetrievalEvalReport,
} from './faq-retrieval-eval.types';

const EMPTY_COUNTS: Record<FaqRetrievalCaseOutcome, number> = {
  HIT_AT_ONE: 0,
  HIT_BELOW_ONE: 0,
  MISS: 0,
  CORRECT_SILENCE: 0,
  FALSE_ANSWER: 0,
  STAFF_ONLY_WITHHELD: 0,
  STAFF_ONLY_LEAKED: 0,
};

/**
 * Scores one retrieval run into the metrics of `P15-T12` / `PCS-T04`.
 *
 * A pure function over observations, for the reason `scoreToolSelection` is
 * one: the expensive part is *collecting* them — a live `bge-m3`, a seeded
 * corpus, one embed per question — and keeping the arithmetic separate means
 * it is unit-testable without any of that, and that a run captured once can be
 * re-scored after the rubric changes instead of being re-paid for.
 *
 * The outcome taxonomy separates three kinds of wrong that a single "accuracy"
 * number would blend into one:
 *
 * - `MISS` — the corpus had the answer and retrieval did not surface it. The
 *   customer is told the clinic has nothing written down when it does.
 * - `FALSE_ANSWER` — the corpus had nothing and retrieval returned passages
 *   anyway. Worse than a miss: the model is handed irrelevant text and will
 *   ground a confident answer in it rather than admit the gap.
 * - `STAFF_ONLY_LEAKED` — an internal document reached the patient channel.
 *   Not a quality result at all; it means the scope predicate is broken.
 *
 * `HIT_BELOW_ONE` is a hit, not a half-failure: the passages all reach the
 * model together, so a correct document at rank three still grounds the
 * answer. It is tracked apart from `HIT_AT_ONE` because a corpus drifting
 * from rank one to rank three is degrading before it starts missing.
 */
export function scoreFaqRetrieval(
  evalCases: readonly FaqRetrievalEvalCase[],
  observations: readonly FaqRetrievalEvalObservation[],
  corpus: readonly FaqEvalDocument[],
): FaqRetrievalEvalReport {
  const observationsByCaseId = new Map(
    observations.map((observation) => [observation.caseId, observation]),
  );
  const languageBySlug = new Map(corpus.map((document) => [document.slug, document.language]));
  const results = evalCases.map((evalCase) =>
    scoreCase(evalCase, observationsByCaseId.get(evalCase.id), languageBySlug),
  );
  const counts = { ...EMPTY_COUNTS };
  for (const result of results) {
    counts[result.outcome] += 1;
  }
  const answerable = pairCasesWithResults(evalCases, results, 'ANSWERABLE');
  const outOfScope = pairCasesWithResults(evalCases, results, 'OUT_OF_SCOPE');
  const staffOnly = pairCasesWithResults(evalCases, results, 'STAFF_ONLY');
  const crossLingual = answerable.filter((result) => result.isCrossLingual);
  return {
    totalCases: results.length,
    recall: ratio(answerable.filter(isHit).length, answerable.length),
    precisionAtOne: ratio(
      answerable.filter((result) => result.outcome === 'HIT_AT_ONE').length,
      answerable.length,
    ),
    // A miss contributes 0 rather than being excluded: dropping misses from
    // the denominator would make a run that found two documents perfectly and
    // missed eight outscore one that found all ten at rank two.
    meanReciprocalRank: ratio(
      answerable.reduce(
        (total, result) =>
          total + (result.expectedDocumentRank === null ? 0 : 1 / result.expectedDocumentRank),
        0,
      ),
      answerable.length,
    ),
    crossLingualRecall: ratio(crossLingual.filter(isHit).length, crossLingual.length),
    falseAnswerRate: ratio(
      outOfScope.filter((result) => result.outcome === 'FALSE_ANSWER').length,
      outOfScope.length,
    ),
    staffOnlyLeakRate: ratio(
      staffOnly.filter((result) => result.outcome === 'STAFF_ONLY_LEAKED').length,
      staffOnly.length,
    ),
    counts,
    results,
  };
}

function scoreCase(
  evalCase: FaqRetrievalEvalCase,
  observation: FaqRetrievalEvalObservation | undefined,
  languageBySlug: ReadonlyMap<string, string>,
): FaqRetrievalCaseResult {
  // A case with no observation is scored as the worst outcome its expectation
  // allows rather than skipped. A run that silently dropped a case must not
  // score better than one that answered it badly — except for the two
  // expectations where returning nothing *is* the right answer, and a dropped
  // case is indistinguishable from a correct silence. That asymmetry is
  // acknowledged rather than hidden: the runner emits one observation per
  // case, so a gap here means the run itself was incomplete.
  const retrieved = observation?.retrievedDocumentSlugs ?? [];
  const expectedIndex =
    evalCase.expectedDocumentSlug === null
      ? -1
      : retrieved.indexOf(evalCase.expectedDocumentSlug);
  const expectedDocumentRank = expectedIndex === -1 ? null : expectedIndex + 1;
  const isCrossLingual =
    evalCase.expectedDocumentSlug !== null &&
    languageBySlug.get(evalCase.expectedDocumentSlug) !== evalCase.questionLanguage;

  if (evalCase.expectation === 'STAFF_ONLY') {
    return {
      caseId: evalCase.id,
      outcome: expectedDocumentRank === null ? 'STAFF_ONLY_WITHHELD' : 'STAFF_ONLY_LEAKED',
      expectedDocumentRank,
      isCrossLingual: false,
    };
  }
  if (evalCase.expectation === 'OUT_OF_SCOPE') {
    return {
      caseId: evalCase.id,
      outcome: retrieved.length === 0 ? 'CORRECT_SILENCE' : 'FALSE_ANSWER',
      expectedDocumentRank: null,
      isCrossLingual: false,
    };
  }
  return {
    caseId: evalCase.id,
    outcome:
      expectedDocumentRank === null ? 'MISS' : expectedDocumentRank === 1 ? 'HIT_AT_ONE' : 'HIT_BELOW_ONE',
    expectedDocumentRank,
    isCrossLingual,
  };
}

function pairCasesWithResults(
  evalCases: readonly FaqRetrievalEvalCase[],
  results: readonly FaqRetrievalCaseResult[],
  expectation: FaqRetrievalEvalCase['expectation'],
): FaqRetrievalCaseResult[] {
  const idsWithExpectation = new Set(
    evalCases.filter((evalCase) => evalCase.expectation === expectation).map((c) => c.id),
  );
  return results.filter((result) => idsWithExpectation.has(result.caseId));
}

function isHit(result: FaqRetrievalCaseResult): boolean {
  return result.outcome === 'HIT_AT_ONE' || result.outcome === 'HIT_BELOW_ONE';
}

/** An empty denominator reports 0 rather than NaN, so a report is printable. */
function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}
