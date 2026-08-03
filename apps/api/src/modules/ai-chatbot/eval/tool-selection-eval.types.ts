import { ChatToolNameValue } from '@hms/shared-types';

/**
 * One question of the §4.7.3 eval set.
 *
 * `expectedTool` of `null` means **no tool should be called** — either the
 * question is answerable without one, or it is genuinely ambiguous. The two
 * are distinguished by `expectAmbiguous`, because they score differently:
 * calling nothing for an answerable question is correct, and calling nothing
 * for an ambiguous one is correct *and* should have produced a clarifying
 * question rather than an answer.
 */
export type ToolSelectionEvalCase = {
  id: string;
  language: 'ID' | 'EN';
  question: string;
  expectedTool: ChatToolNameValue | null;
  /**
   * Arguments that must match for the case to count toward correct-args.
   * Only the fields that matter are listed — a tool defaulting a field it was
   * not given is correct behaviour, not a mismatch.
   */
  expectedArguments?: Record<string, unknown>;
  /** True when calling nothing is right *and* a clarifying question is wanted. */
  expectAmbiguous?: boolean;
  /**
   * Why this case is in the set. Kept with the case so a future reader can
   * tell a deliberate trap from a typo.
   */
  rationale: string;
};

/** What the model actually did for one case, normalized off the wire. */
export type ToolSelectionEvalObservation = {
  caseId: string;
  calledTool: string | null;
  calledArguments: Record<string, unknown> | null;
  /** The assistant's own text, used only to detect a clarifying question. */
  replyText: string;
};

export type ToolSelectionCaseOutcome =
  | 'CORRECT_TOOL'
  | 'WRONG_TOOL'
  | 'MISSED_TOOL'
  | 'FALSE_TOOL'
  | 'CORRECT_ABSTENTION'
  | 'CLARIFIED';

export type ToolSelectionCaseResult = {
  caseId: string;
  outcome: ToolSelectionCaseOutcome;
  /** Only meaningful when `outcome` is `CORRECT_TOOL`. */
  hasCorrectArguments: boolean;
};

/**
 * The five metrics of §4.7.3, plus the counts they were computed from so a
 * reader can check the arithmetic rather than trust it.
 *
 * Every rate is a fraction in [0, 1]. `clarifyRate` is deliberately reported
 * alongside the failure rates and **is not one of them**: asking back when a
 * question is genuinely ambiguous is the behaviour §4.7.1 lever 4 asks for,
 * and one clarifying question costs less than one wrong lookup rendered as
 * fact.
 */
export type ToolSelectionEvalReport = {
  totalCases: number;
  correctToolRate: number;
  correctArgsRate: number;
  falseToolRate: number;
  missedToolRate: number;
  clarifyRate: number;
  counts: Record<ToolSelectionCaseOutcome, number>;
  results: ToolSelectionCaseResult[];
};
