import { scoreFaqRetrieval } from './score-faq-retrieval';
import {
  FaqEvalDocument,
  FaqRetrievalEvalCase,
  FaqRetrievalEvalObservation,
} from './faq-retrieval-eval.types';

describe('scoreFaqRetrieval', () => {
  const inputCorpus: FaqEvalDocument[] = [
    {
      slug: 'hours-id',
      title: 'Jam Operasional',
      language: 'ID',
      visibility: 'BOTH',
      body: 'Buka 08.00.',
    },
    {
      slug: 'cancel-en',
      title: 'Cancellation',
      language: 'EN',
      visibility: 'BOTH',
      body: 'Cancel 24 hours ahead.',
    },
    {
      slug: 'sop-internal',
      title: 'SOP Internal',
      language: 'ID',
      visibility: 'DOCTOR',
      body: 'Eskalasi 30 menit.',
    },
  ];

  function buildCase(overrides: Partial<FaqRetrievalEvalCase> = {}): FaqRetrievalEvalCase {
    return {
      id: 'case-1',
      questionLanguage: 'ID',
      question: 'jam buka?',
      expectedDocumentSlug: 'hours-id',
      expectation: 'ANSWERABLE',
      rationale: 'test',
      ...overrides,
    };
  }

  function buildObservation(
    caseId: string,
    retrievedDocumentSlugs: (string | null)[],
  ): FaqRetrievalEvalObservation {
    return { caseId, retrievedDocumentSlugs };
  }

  it('counts the expected document at rank one as a hit at one', () => {
    const actualReport = scoreFaqRetrieval(
      [buildCase()],
      [buildObservation('case-1', ['hours-id', 'cancel-en'])],
      inputCorpus,
    );

    expect(actualReport.counts.HIT_AT_ONE).toBe(1);
    expect(actualReport.recall).toBe(1);
    expect(actualReport.precisionAtOne).toBe(1);
    expect(actualReport.meanReciprocalRank).toBe(1);
  });

  it('counts a correct document below rank one as a hit, not a half-failure', () => {
    const actualReport = scoreFaqRetrieval(
      [buildCase()],
      [buildObservation('case-1', ['cancel-en', 'hours-id'])],
      inputCorpus,
    );

    // The passages all reach the model together, so a correct document at
    // rank two still grounds the answer. Recall counts it; precision does not.
    expect(actualReport.counts.HIT_BELOW_ONE).toBe(1);
    expect(actualReport.recall).toBe(1);
    expect(actualReport.precisionAtOne).toBe(0);
    expect(actualReport.meanReciprocalRank).toBe(0.5);
  });

  it('scores a miss as zero reciprocal rank rather than excluding it', () => {
    const actualReport = scoreFaqRetrieval(
      [buildCase({ id: 'hit' }), buildCase({ id: 'missed' })],
      [
        buildObservation('hit', ['hours-id']),
        buildObservation('missed', ['cancel-en']),
      ],
      inputCorpus,
    );

    // Dropping misses from the denominator would let a run that found one
    // document perfectly and missed one outscore a run that found both at
    // rank two.
    expect(actualReport.recall).toBe(0.5);
    expect(actualReport.meanReciprocalRank).toBe(0.5);
    expect(actualReport.counts.MISS).toBe(1);
  });

  it('keeps an unknown document in the ranking instead of dropping it', () => {
    const actualReport = scoreFaqRetrieval(
      [buildCase()],
      [buildObservation('case-1', [null, 'hours-id'])],
      inputCorpus,
    );

    // A foreign document at position one is a precision failure. Compacting
    // it away would silently promote the correct document to rank one.
    expect(actualReport.precisionAtOne).toBe(0);
    expect(actualReport.results[0]?.expectedDocumentRank).toBe(2);
  });

  it('measures cross-lingual recall only over cases that cross a language', () => {
    const actualReport = scoreFaqRetrieval(
      [
        buildCase({ id: 'same-lang', expectedDocumentSlug: 'hours-id', questionLanguage: 'ID' }),
        buildCase({ id: 'cross-lang', expectedDocumentSlug: 'cancel-en', questionLanguage: 'ID' }),
      ],
      [
        buildObservation('same-lang', ['hours-id']),
        buildObservation('cross-lang', ['hours-id']),
      ],
      inputCorpus,
    );

    // Overall recall is 50%, but the half that failed is the whole
    // cross-lingual half — the number the vector decision rests on. Blending
    // them would hide exactly that.
    expect(actualReport.recall).toBe(0.5);
    expect(actualReport.crossLingualRecall).toBe(0);
  });

  it('reports a healthy cross-lingual recall when the pairs actually work', () => {
    const actualReport = scoreFaqRetrieval(
      [buildCase({ id: 'cross-lang', expectedDocumentSlug: 'cancel-en', questionLanguage: 'ID' })],
      [buildObservation('cross-lang', ['cancel-en'])],
      inputCorpus,
    );

    expect(actualReport.crossLingualRecall).toBe(1);
  });

  it('counts any passage on an out-of-scope question as a false answer', () => {
    const actualReport = scoreFaqRetrieval(
      [
        buildCase({ id: 'silent', expectedDocumentSlug: null, expectation: 'OUT_OF_SCOPE' }),
        buildCase({ id: 'noisy', expectedDocumentSlug: null, expectation: 'OUT_OF_SCOPE' }),
      ],
      [buildObservation('silent', []), buildObservation('noisy', ['hours-id'])],
      inputCorpus,
    );

    expect(actualReport.falseAnswerRate).toBe(0.5);
    expect(actualReport.counts.CORRECT_SILENCE).toBe(1);
    expect(actualReport.counts.FALSE_ANSWER).toBe(1);
  });

  it('does not let an out-of-scope case dilute recall', () => {
    const actualReport = scoreFaqRetrieval(
      [
        buildCase({ id: 'answerable' }),
        buildCase({ id: 'oos', expectedDocumentSlug: null, expectation: 'OUT_OF_SCOPE' }),
      ],
      [buildObservation('answerable', ['hours-id']), buildObservation('oos', [])],
      inputCorpus,
    );

    // Each metric's denominator is the cases it is about. A set with more
    // negative cases must not report a better recall for identical behaviour.
    expect(actualReport.recall).toBe(1);
    expect(actualReport.totalCases).toBe(2);
  });

  it('reports a staff-only document reaching the patient channel as a leak', () => {
    const actualReport = scoreFaqRetrieval(
      [
        buildCase({
          id: 'staff',
          expectedDocumentSlug: 'sop-internal',
          expectation: 'STAFF_ONLY',
        }),
      ],
      [buildObservation('staff', ['sop-internal'])],
      inputCorpus,
    );

    // Not a quality result: a non-zero leak rate means the scope predicate is
    // broken, which is a defect rather than a tuning outcome.
    expect(actualReport.staffOnlyLeakRate).toBe(1);
    expect(actualReport.counts.STAFF_ONLY_LEAKED).toBe(1);
  });

  it('reports a withheld staff-only document as the pass it is', () => {
    const actualReport = scoreFaqRetrieval(
      [
        buildCase({
          id: 'staff',
          expectedDocumentSlug: 'sop-internal',
          expectation: 'STAFF_ONLY',
        }),
      ],
      [buildObservation('staff', ['hours-id'])],
      inputCorpus,
    );

    expect(actualReport.staffOnlyLeakRate).toBe(0);
    expect(actualReport.counts.STAFF_ONLY_WITHHELD).toBe(1);
  });

  it('scores a case the run never observed as a miss rather than skipping it', () => {
    const actualReport = scoreFaqRetrieval([buildCase({ id: 'dropped' })], [], inputCorpus);

    // A run that silently dropped a case must not score better than one that
    // answered it badly.
    expect(actualReport.counts.MISS).toBe(1);
    expect(actualReport.recall).toBe(0);
  });

  it('reports zero rather than NaN when a metric has no cases', () => {
    const actualReport = scoreFaqRetrieval(
      [buildCase({ id: 'oos', expectedDocumentSlug: null, expectation: 'OUT_OF_SCOPE' })],
      [buildObservation('oos', [])],
      inputCorpus,
    );

    // There are no answerable cases here, and a report has to stay printable.
    expect(actualReport.recall).toBe(0);
    expect(actualReport.meanReciprocalRank).toBe(0);
    expect(actualReport.crossLingualRecall).toBe(0);
    expect(actualReport.staffOnlyLeakRate).toBe(0);
  });
});
