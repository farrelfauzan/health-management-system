import { RETRIEVAL_EVAL_DOCUMENTS, RETRIEVAL_EVAL_SET } from './retrieval-eval-set';
import { scoreRetrieval } from './score-retrieval';
import { RetrievalEvalCase } from './retrieval-eval.types';

describe('scoreRetrieval', () => {
  function buildCase(overrides: Partial<RetrievalEvalCase> = {}): RetrievalEvalCase {
    return {
      id: 'case-1',
      questionLanguage: 'ID',
      question: 'Klinik buka jam berapa?',
      expectedDocumentKeys: ['faq-jam-layanan'],
      isCrossLingual: false,
      rationale: 'fixture',
      ...overrides,
    };
  }

  it('scores a first-rank hit as recalled and ranked first', () => {
    const actual = scoreRetrieval(
      [buildCase()],
      [{ caseId: 'case-1', retrievedDocumentKeys: ['faq-jam-layanan', 'sop-rujukan'] }],
    );

    expect(actual.recallRate).toBe(1);
    expect(actual.rankFirstRate).toBe(1);
    expect(actual.meanReciprocalRank).toBe(1);
  });

  it('counts a lower-ranked hit as recalled but not ranked first', () => {
    const actual = scoreRetrieval(
      [buildCase()],
      [{ caseId: 'case-1', retrievedDocumentKeys: ['sop-rujukan', 'faq-jam-layanan'] }],
    );

    // Recall is the headline because retrieval feeds a generator: a passage
    // ranked second still reaches the model and can still ground the answer.
    expect(actual.recallRate).toBe(1);
    expect(actual.rankFirstRate).toBe(0);
    expect(actual.meanReciprocalRank).toBe(0.5);
  });

  it('scores a miss as zero on every metric', () => {
    const actual = scoreRetrieval(
      [buildCase()],
      [{ caseId: 'case-1', retrievedDocumentKeys: ['sop-rujukan'] }],
    );

    expect(actual.recallRate).toBe(0);
    expect(actual.meanReciprocalRank).toBe(0);
    expect(actual.results[0]?.bestRank).toBeNull();
  });

  it('takes the best position when several documents would answer', () => {
    const actual = scoreRetrieval(
      [buildCase({ expectedDocumentKeys: ['sop-pendaftaran', 'faq-jam-layanan'] })],
      [
        {
          caseId: 'case-1',
          retrievedDocumentKeys: ['sop-rujukan', 'faq-jam-layanan', 'sop-pendaftaran'],
        },
      ],
    );

    expect(actual.results[0]?.bestRank).toBe(2);
  });

  it('reports cross-lingual cases separately from the aggregate', () => {
    // The failure this separation exists to expose: a retriever that works
    // only within a language would look merely mediocre in an aggregate, and
    // it is precisely what choosing vectors was supposed to prevent.
    const actual = scoreRetrieval(
      [
        buildCase({ id: 'same-1', isCrossLingual: false }),
        buildCase({ id: 'same-2', isCrossLingual: false }),
        buildCase({ id: 'cross-1', isCrossLingual: true }),
        buildCase({ id: 'cross-2', isCrossLingual: true }),
      ],
      [
        { caseId: 'same-1', retrievedDocumentKeys: ['faq-jam-layanan'] },
        { caseId: 'same-2', retrievedDocumentKeys: ['faq-jam-layanan'] },
        { caseId: 'cross-1', retrievedDocumentKeys: ['sop-rujukan'] },
        { caseId: 'cross-2', retrievedDocumentKeys: ['sop-rujukan'] },
      ],
    );

    expect(actual.recallRate).toBe(0.5);
    expect(actual.sameLanguageRecallRate).toBe(1);
    expect(actual.crossLingualRecallRate).toBe(0);
    expect(actual.crossLingualCaseCount).toBe(2);
  });

  it('scores a dropped case as a miss rather than skipping it', () => {
    const actual = scoreRetrieval([buildCase({ id: 'never-run' })], []);

    expect(actual.totalCases).toBe(1);
    expect(actual.recallRate).toBe(0);
  });

  it('reports zero rather than NaN when a group has no cases', () => {
    const actual = scoreRetrieval([buildCase({ isCrossLingual: false })], []);

    expect(actual.crossLingualRecallRate).toBe(0);
    expect(actual.crossLingualMeanReciprocalRank).toBe(0);
  });

  describe('the checked-in eval set', () => {
    it('has unique case ids and unique document keys', () => {
      const caseIds = RETRIEVAL_EVAL_SET.map((evalCase) => evalCase.id);
      const documentKeys = RETRIEVAL_EVAL_DOCUMENTS.map((document) => document.key);

      expect(new Set(caseIds).size).toBe(caseIds.length);
      expect(new Set(documentKeys).size).toBe(documentKeys.length);
    });

    it('expects only documents the fixture corpus actually contains', () => {
      const documentKeys = new Set(RETRIEVAL_EVAL_DOCUMENTS.map((document) => document.key));
      const unknown = RETRIEVAL_EVAL_SET.flatMap((evalCase) =>
        evalCase.expectedDocumentKeys.filter((key) => !documentKeys.has(key)),
      );

      // A case expecting a document nobody seeds can only ever fail, and it
      // would fail as a retrieval regression rather than as the typo it is.
      expect(unknown).toEqual([]);
    });

    it('carries cross-lingual pairs in both directions', () => {
      const crossLingual = RETRIEVAL_EVAL_SET.filter((evalCase) => evalCase.isCrossLingual);
      const documentsByKey = new Map(
        RETRIEVAL_EVAL_DOCUMENTS.map((document) => [document.key, document]),
      );
      const directions = new Set(
        crossLingual.map((evalCase) => {
          const target = documentsByKey.get(evalCase.expectedDocumentKeys[0] ?? '');
          return `${evalCase.questionLanguage}->${target?.language ?? '?'}`;
        }),
      );

      // §5.2: these pairs are the reason vectors were chosen. One direction
      // only would leave half the decision unverified.
      expect(directions).toContain('ID->EN');
      expect(directions).toContain('EN->ID');
      expect(crossLingual.length).toBeGreaterThanOrEqual(4);
    });

    it('marks a cross-lingual case only when the answer really is in the other language', () => {
      const documentsByKey = new Map(
        RETRIEVAL_EVAL_DOCUMENTS.map((document) => [document.key, document]),
      );
      const mismarked = RETRIEVAL_EVAL_SET.filter((evalCase) => {
        const target = documentsByKey.get(evalCase.expectedDocumentKeys[0] ?? '');
        const isActuallyCrossLingual = target !== undefined && target.language !== evalCase.questionLanguage;
        return isActuallyCrossLingual !== evalCase.isCrossLingual;
      }).map((evalCase) => evalCase.id);

      // The flag drives a headline metric, so it has to be derived-checkable
      // rather than trusted.
      expect(mismarked).toEqual([]);
    });

    it('keeps lexical cases so a hybrid that stopped fusing is visible', () => {
      const lexicalIds = RETRIEVAL_EVAL_SET.filter((evalCase) =>
        evalCase.id.startsWith('lex-'),
      ).map((evalCase) => evalCase.id);

      // A purely semantic set would pass even if the full-text half were
      // silently dropped from the fusion.
      expect(lexicalIds.length).toBeGreaterThanOrEqual(3);
    });

    it('seeds documents in both languages and across visibilities', () => {
      const languages = new Set(RETRIEVAL_EVAL_DOCUMENTS.map((document) => document.language));
      const visibilities = new Set(RETRIEVAL_EVAL_DOCUMENTS.map((document) => document.visibility));

      expect([...languages].sort()).toEqual(['EN', 'ID']);
      expect(visibilities.size).toBeGreaterThanOrEqual(2);
    });
  });
});
