/**
 * What a keystroke means inside a treegrid (SJ-90).
 *
 * Split out as a pure function because it is the part worth testing: TanStack
 * Table is headless and renders a table, so the WAI-ARIA keyboard model is ours
 * to write, and "Left collapses, or moves to the parent when already collapsed"
 * is exactly the rule that gets quietly broken by a later refactor.
 *
 * Modelled on the WAI-ARIA Authoring Practices treegrid pattern:
 * ArrowDown/ArrowUp move by one visible row, ArrowRight expands a collapsed
 * branch and then descends into it, ArrowLeft collapses an open branch and then
 * ascends out of it, Home/End jump to the ends. A printable character is
 * typeahead.
 */
export type TreeKeyAction =
  | { kind: 'collapse' }
  | { kind: 'expand' }
  | { kind: 'focusFirst' }
  | { kind: 'focusLast' }
  | { kind: 'focusNext' }
  | { kind: 'focusParent' }
  | { kind: 'focusPrevious' }
  | { kind: 'none' }
  | { kind: 'typeahead'; character: string };

export type TreeKeyContext = {
  /** True when the focused row has children at all. */
  readonly canExpand: boolean;
  /** True when the focused row's children are currently shown. */
  readonly isExpanded: boolean;
  /** False for a root, which has nowhere further out to go. */
  readonly hasParent: boolean;
};

export function resolveTreeKeyAction(key: string, context: TreeKeyContext): TreeKeyAction {
  if (key === 'ArrowDown') {
    return { kind: 'focusNext' };
  }
  if (key === 'ArrowUp') {
    return { kind: 'focusPrevious' };
  }
  if (key === 'ArrowRight') {
    // Two steps in one key, in the order the pattern specifies: open a closed
    // branch, and only move inward once it is already open. A single press that
    // both expanded and descended would skip past the node the user just
    // revealed.
    if (context.canExpand && !context.isExpanded) {
      return { kind: 'expand' };
    }
    if (context.canExpand) {
      return { kind: 'focusNext' };
    }
    return { kind: 'none' };
  }
  if (key === 'ArrowLeft') {
    // The mirror image: close an open branch, and only step out to the parent
    // when there is nothing left to close here.
    if (context.canExpand && context.isExpanded) {
      return { kind: 'collapse' };
    }
    if (context.hasParent) {
      return { kind: 'focusParent' };
    }
    return { kind: 'none' };
  }
  if (key === 'Home') {
    return { kind: 'focusFirst' };
  }
  if (key === 'End') {
    return { kind: 'focusLast' };
  }
  // Printable single characters are typeahead. Modifier combinations are not:
  // Ctrl+F belongs to the browser, and stealing it would be worse than having
  // no typeahead at all.
  if (key.length === 1 && key !== ' ') {
    return { kind: 'typeahead', character: key.toLowerCase() };
  }
  return { kind: 'none' };
}
