/**
 * One question of the §5 retrieval evaluation.
 *
 * `expectedDocumentKeys` are the **stable keys** of the fixture documents
 * that answer it, not database ids: the corpus is seeded fresh for each run,
 * so ids differ between runs and a fixture pinned to one would only ever pass
 * on the machine that wrote it.
 */
export type RetrievalEvalCase = {
  id: string;
  /** The language the question is written in. */
  questionLanguage: 'ID' | 'EN';
  question: string;
  /**
   * Documents that genuinely answer the question, best first. More than one
   * is allowed: several SOPs can cover the same procedure, and demanding a
   * single "correct" document would measure the fixture rather than the
   * retriever.
   */
  expectedDocumentKeys: readonly string[];
  /**
   * True when the answer lives in a document written in the *other*
   * language. **These are the reason vectors were chosen** (§5.2), so they
   * are marked rather than merely present — the report scores them
   * separately, and a run where only the same-language cases pass is a run
   * that has not justified the architecture.
   */
  isCrossLingual: boolean;
  rationale: string;
};

/** One fixture document, seeded before a run and removed after. */
export type RetrievalEvalDocument = {
  key: string;
  title: string;
  language: 'ID' | 'EN';
  visibility: 'PATIENT' | 'DOCTOR' | 'BOTH';
  content: string;
};

/** What the retriever returned for one case, document keys best-first. */
export type RetrievalEvalObservation = {
  caseId: string;
  retrievedDocumentKeys: readonly string[];
};

export type RetrievalEvalCaseResult = {
  caseId: string;
  isCrossLingual: boolean;
  /** Whether any expected document appeared anywhere in the results. */
  didRecall: boolean;
  /** Whether an expected document was ranked first. */
  didRankFirst: boolean;
  /**
   * 1-based position of the best-ranked expected document, or null when none
   * was returned. Reported per case so a regression that moved a document
   * from rank 1 to rank 4 is visible as more than a recall number holding
   * steady.
   */
  bestRank: number | null;
  /**
   * Mean reciprocal rank contribution — `1 / bestRank`, or 0 on a miss.
   */
  reciprocalRank: number;
};

/**
 * The report. Recall is the headline because retrieval feeds a generator: a
 * passage ranked third still reaches the model, where a passage never
 * retrieved cannot. Rank-first and MRR say how much prompt budget is being
 * spent to get there.
 */
export type RetrievalEvalReport = {
  totalCases: number;
  recallRate: number;
  rankFirstRate: number;
  meanReciprocalRank: number;
  /** The same three, over the cross-lingual cases only. */
  crossLingualCaseCount: number;
  crossLingualRecallRate: number;
  crossLingualMeanReciprocalRank: number;
  /** And over the same-language cases, so the gap between them is readable. */
  sameLanguageRecallRate: number;
  results: RetrievalEvalCaseResult[];
};
