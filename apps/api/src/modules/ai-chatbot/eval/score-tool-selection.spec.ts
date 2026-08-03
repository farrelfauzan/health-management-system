import { scoreToolSelection } from './score-tool-selection';
import { TOOL_SELECTION_EVAL_SET } from './tool-selection-eval-set';
import { ToolSelectionEvalCase, ToolSelectionEvalObservation } from './tool-selection-eval.types';

describe('scoreToolSelection', () => {
  function buildCase(overrides: Partial<ToolSelectionEvalCase>): ToolSelectionEvalCase {
    return {
      id: 'case-1',
      language: 'EN',
      question: 'Who are my patients?',
      expectedTool: 'list_my_patients',
      rationale: 'fixture',
      ...overrides,
    };
  }

  function buildObservation(
    overrides: Partial<ToolSelectionEvalObservation>,
  ): ToolSelectionEvalObservation {
    return {
      caseId: 'case-1',
      calledTool: 'list_my_patients',
      calledArguments: {},
      replyText: 'Saya cek daftar pasien Anda.',
      ...overrides,
    };
  }

  it('scores the right tool as correct', () => {
    const actual = scoreToolSelection([buildCase({})], [buildObservation({})]);

    expect(actual.counts.CORRECT_TOOL).toBe(1);
    expect(actual.correctToolRate).toBe(1);
    expect(actual.missedToolRate).toBe(0);
  });

  it('separates a wrong tool from a missed one', () => {
    const actual = scoreToolSelection(
      [buildCase({ id: 'wrong' }), buildCase({ id: 'missed' })],
      [
        buildObservation({ caseId: 'wrong', calledTool: 'check_medication_stock' }),
        buildObservation({ caseId: 'missed', calledTool: null }),
      ],
    );

    // Both are failures, and they are not the same failure: a wrong tool is
    // visible on the rendered card, a missed one is answered from training
    // data with nothing marking it (§4.7.2).
    expect(actual.counts.WRONG_TOOL).toBe(1);
    expect(actual.counts.MISSED_TOOL).toBe(1);
    expect(actual.missedToolRate).toBe(0.5);
    expect(actual.correctToolRate).toBe(0);
  });

  it('counts a tool called when none was needed as a false tool', () => {
    const actual = scoreToolSelection(
      [buildCase({ expectedTool: null })],
      [buildObservation({ calledTool: 'list_my_patients' })],
    );

    expect(actual.counts.FALSE_TOOL).toBe(1);
    expect(actual.falseToolRate).toBe(1);
  });

  it('counts a clarifying question on an ambiguous case as success', () => {
    const actual = scoreToolSelection(
      [buildCase({ expectedTool: null, expectAmbiguous: true, question: 'Cek pasien itu dong.' })],
      [buildObservation({ calledTool: null, replyText: 'Pasien yang mana yang Anda maksud?' })],
    );

    // Lever 4: one clarifying question costs less than one wrong lookup
    // rendered as fact, so a high clarify rate is a good measurement.
    expect(actual.counts.CLARIFIED).toBe(1);
    expect(actual.clarifyRate).toBe(1);
    expect(actual.counts.FALSE_TOOL).toBe(0);
  });

  it('distinguishes abstaining silently from actually asking back', () => {
    const actual = scoreToolSelection(
      [buildCase({ expectedTool: null, expectAmbiguous: true })],
      [buildObservation({ calledTool: null, replyText: 'Baik.' })],
    );

    // It did the safe thing and left the user stuck. Collapsing this into
    // CLARIFIED would hide the difference the metric exists to show.
    expect(actual.counts.CORRECT_ABSTENTION).toBe(1);
    expect(actual.clarifyRate).toBe(0);
  });

  it('scores arguments only for cases that picked the right tool', () => {
    const actual = scoreToolSelection(
      [
        buildCase({ id: 'good-args', expectedArguments: { page: 2 } }),
        buildCase({ id: 'bad-args', expectedArguments: { page: 2 } }),
        buildCase({ id: 'wrong-tool', expectedArguments: { page: 2 } }),
      ],
      [
        buildObservation({ caseId: 'good-args', calledArguments: { page: 2 } }),
        buildObservation({ caseId: 'bad-args', calledArguments: { page: 1 } }),
        buildObservation({ caseId: 'wrong-tool', calledTool: 'check_medication_stock' }),
      ],
    );

    // The wrong-tool case is not in the denominator: its arguments are not a
    // fact about argument extraction.
    expect(actual.correctArgsRate).toBe(0.5);
  });

  it('treats an empty expectation as "send nothing"', () => {
    const actual = scoreToolSelection(
      [
        buildCase({ id: 'omitted', expectedTool: 'list_my_appointments', expectedArguments: {} }),
        buildCase({ id: 'guessed', expectedTool: 'list_my_appointments', expectedArguments: {} }),
      ],
      [
        buildObservation({ caseId: 'omitted', calledTool: 'list_my_appointments', calledArguments: {} }),
        buildObservation({
          caseId: 'guessed',
          calledTool: 'list_my_appointments',
          calledArguments: { date: '2026-08-03' },
        }),
      ],
    );

    // A model deriving today's date is the exact behaviour §4.7.1 lever 3
    // removes, so sending one where none was wanted is a miss.
    expect(actual.correctArgsRate).toBe(0.5);
  });

  it('ignores extra keys the tool defaulted', () => {
    const actual = scoreToolSelection(
      [buildCase({ expectedArguments: { medicationName: 'amoxicillin' } })],
      [
        buildObservation({
          calledArguments: { medicationName: 'amoxicillin', page: 1 },
        }),
      ],
    );

    expect(actual.correctArgsRate).toBe(1);
  });

  it('scores a dropped case as a failure rather than skipping it', () => {
    const actual = scoreToolSelection([buildCase({ id: 'never-run' })], []);

    // A run that silently lost a case must not score better than one that
    // answered it badly.
    expect(actual.counts.MISSED_TOOL).toBe(1);
    expect(actual.totalCases).toBe(1);
  });

  it('reports zero rather than NaN when a metric has no cases', () => {
    const actual = scoreToolSelection([buildCase({})], [buildObservation({})]);

    expect(actual.clarifyRate).toBe(0);
    expect(actual.falseToolRate).toBe(0);
  });

  describe('the checked-in eval set', () => {
    it('has unique ids', () => {
      const ids = TOOL_SELECTION_EVAL_SET.map((evalCase) => evalCase.id);

      expect(new Set(ids).size).toBe(ids.length);
    });

    it('covers both languages on the same intents', () => {
      const byLanguage = { ID: 0, EN: 0 };
      for (const evalCase of TOOL_SELECTION_EVAL_SET) {
        byLanguage[evalCase.language] += 1;
      }

      // A provider that scores well in English and badly in Indonesian is the
      // failure the pairing exists to expose, and a lopsided set hides it.
      expect(byLanguage.ID).toBeGreaterThanOrEqual(8);
      expect(byLanguage.EN).toBeGreaterThanOrEqual(8);
    });

    it('keeps negative cases a substantial share of the set', () => {
      const negativeCases = TOOL_SELECTION_EVAL_SET.filter(
        (evalCase) => evalCase.expectedTool === null,
      );

      // Without them a model that calls a tool for everything scores
      // perfectly on correct-tool rate while being unusable.
      expect(negativeCases.length / TOOL_SELECTION_EVAL_SET.length).toBeGreaterThan(0.2);
    });

    it('includes ambiguous cases so the clarify metric has a denominator', () => {
      expect(
        TOOL_SELECTION_EVAL_SET.filter((evalCase) => evalCase.expectAmbiguous === true).length,
      ).toBeGreaterThanOrEqual(2);
    });

    it('exercises every doctor-channel tool at least once', () => {
      const exercised = new Set(
        TOOL_SELECTION_EVAL_SET.map((evalCase) => evalCase.expectedTool).filter(
          (name): name is NonNullable<typeof name> => name !== null,
        ),
      );

      expect([...exercised].sort()).toEqual([
        'check_medication_expiry',
        'check_medication_stock',
        'get_patient_summary',
        'list_my_appointments',
        'list_my_patients',
      ]);
    });
  });
});
