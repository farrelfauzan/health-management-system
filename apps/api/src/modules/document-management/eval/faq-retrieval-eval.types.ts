import { DocumentLanguageValue, DocumentVisibilityValue } from '@hms/shared-types';

/**
 * One document of the eval corpus.
 *
 * `slug` is the grading key and never leaves this fixture — `search_faq`
 * returns titles, not ids, so the runner maps title back to slug. That is not
 * a workaround: it means the eval grades the channel's real output allowlist
 * rather than a richer shape only the eval can see.
 */
export type FaqEvalDocument = {
  slug: string;
  title: string;
  language: DocumentLanguageValue;
  visibility: DocumentVisibilityValue;
  body: string;
};

/**
 * What a case asserts about the corpus.
 *
 * - `ANSWERABLE` — a specific document answers it, and retrieval should rank
 *   that document's passage first.
 * - `OUT_OF_SCOPE` — nothing in the corpus answers it. Returning passages
 *   anyway is a quality failure: the model is handed irrelevant text and will
 *   ground a confident answer in it.
 * - `STAFF_ONLY` — the only document that answers it is `DOCTOR`-visibility.
 *   Returning it on the patient channel is a **safety** failure, and is
 *   counted separately for exactly that reason.
 */
export type FaqRetrievalExpectation = 'ANSWERABLE' | 'OUT_OF_SCOPE' | 'STAFF_ONLY';

export type FaqRetrievalEvalCase = {
  id: string;
  /** The language the customer types in, independent of the document's. */
  questionLanguage: DocumentLanguageValue;
  question: string;
  /**
   * The corpus document that answers it, or `null` when nothing should come
   * back. For a `STAFF_ONLY` case this names the document that must **not**
   * be returned — the case is graded on its absence.
   */
  expectedDocumentSlug: string | null;
  expectation: FaqRetrievalExpectation;
  /**
   * Why this case is in the set. Kept with the case so a future reader can
   * tell a deliberate trap from a typo.
   */
  rationale: string;
};

/** What retrieval actually returned for one case, in rank order. */
export type FaqRetrievalEvalObservation = {
  caseId: string;
  /**
   * Slugs of the documents the returned passages came from, best-ranked
   * first. A title the fixture does not know maps to `null` and is kept in
   * place rather than dropped, so it still occupies a rank — a foreign
   * document at position one is a precision failure, not an absence.
   */
  retrievedDocumentSlugs: readonly (string | null)[];
};

export type FaqRetrievalCaseOutcome =
  | 'HIT_AT_ONE'
  | 'HIT_BELOW_ONE'
  | 'MISS'
  | 'CORRECT_SILENCE'
  | 'FALSE_ANSWER'
  | 'STAFF_ONLY_WITHHELD'
  | 'STAFF_ONLY_LEAKED';

export type FaqRetrievalCaseResult = {
  caseId: string;
  outcome: FaqRetrievalCaseOutcome;
  /**
   * 1-based rank of the first passage from the expected document, or `null`
   * when it never appeared. Retained per case so `meanReciprocalRank` can be
   * recomputed under a different rubric without re-running the corpus.
   */
  expectedDocumentRank: number | null;
  /** True when the question's language differs from the answer document's. */
  isCrossLingual: boolean;
};

/**
 * The measurement `P15-T12` and `PCS-T04` both ask for.
 *
 * Every rate is a fraction in [0, 1], and each has its **own** denominator —
 * the cases the metric is about, never the whole set. Dividing the leak rate
 * by all cases would let a set with more answerable questions report a safer
 * number for identical behaviour.
 */
export type FaqRetrievalEvalReport = {
  totalCases: number;
  /** Answerable cases where the expected document appeared at any rank. */
  recall: number;
  /** Answerable cases where the expected document was ranked first. */
  precisionAtOne: number;
  /** Mean of 1/rank over answerable cases; a miss contributes 0. */
  meanReciprocalRank: number;
  /**
   * Recall restricted to cases whose question language differs from the
   * answering document's. **This is the number the vector half exists for**
   * — lexical search cannot cross languages at all — so a healthy overall
   * recall with a poor cross-lingual recall means the corpus is being served
   * by exact terms and the embedding decision is unverified.
   */
  crossLingualRecall: number;
  /** Out-of-scope cases that returned anything at all. */
  falseAnswerRate: number;
  /**
   * Staff-only cases whose document reached the patient channel. **This must
   * be zero**, and it is not a quality metric: a non-zero value is the
   * scope predicate failing, which is a defect rather than a tuning result.
   */
  staffOnlyLeakRate: number;
  counts: Record<FaqRetrievalCaseOutcome, number>;
  results: FaqRetrievalCaseResult[];
};
