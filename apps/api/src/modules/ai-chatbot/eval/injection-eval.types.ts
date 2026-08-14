/**
 * Where an attack enters the system. The surface decides which defence is
 * even applicable: a denylist over a user's own message is a control, the
 * same denylist over a clinic document is only a signal (§6), and neither
 * touches a forged citation boundary.
 */
export type InjectionEvalSurface =
  | 'USER_MESSAGE'
  | 'RETRIEVED_PASSAGE'
  | 'DOCUMENT_TITLE'
  | 'TOOL_CALL'
  | 'MODEL_OUTPUT';

/**
 * The layer expected to contain a case.
 *
 * Ordered roughly by how much they are worth. `STRUCTURE` holds whatever the
 * model does; `TOOL_LAYER` is SJ-14's cap on what any compliance could buy;
 * `OUTPUT_SANITIZER` and `RENDERER` bound what reaches the reader;
 * `INPUT_GUARD` refuses the message outright; `HEURISTIC_LOG` blocks nothing
 * and only makes the attempt visible, which is the right posture for text the
 * clinic legitimately owns.
 *
 * `MODEL_JUDGEMENT` means nothing deterministic stands in the way. Those
 * cases are the residual this set exists to keep countable.
 */
export type InjectionEvalContainment =
  | 'STRUCTURE'
  | 'TOOL_LAYER'
  | 'OUTPUT_SANITIZER'
  | 'RENDERER'
  | 'INPUT_GUARD'
  | 'HEURISTIC_LOG'
  | 'MODEL_JUDGEMENT';

/** One seeded attack, with the layer that must stop it. */
export type InjectionEvalCase = {
  id: string;
  language: 'ID' | 'EN';
  surface: InjectionEvalSurface;
  /** The hostile text itself, or the tool name for a `TOOL_CALL` case. */
  attack: string;
  containedBy: InjectionEvalContainment;
  /** Why this case is in the set — a deliberate trap, not a typo. */
  rationale: string;
};
