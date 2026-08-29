import { describe, expect, it } from 'vitest';

import { resolveTreeKeyAction, type TreeKeyContext } from './resolve-tree-key-action';

const EXPANDED_BRANCH: TreeKeyContext = { canExpand: true, isExpanded: true, hasParent: true };
const COLLAPSED_BRANCH: TreeKeyContext = { canExpand: true, isExpanded: false, hasParent: true };
const NESTED_LEAF: TreeKeyContext = { canExpand: false, isExpanded: false, hasParent: true };
const ROOT_LEAF: TreeKeyContext = { canExpand: false, isExpanded: false, hasParent: false };

describe('resolveTreeKeyAction', () => {
  it('moves by one visible row on the vertical arrows', () => {
    expect(resolveTreeKeyAction('ArrowDown', NESTED_LEAF)).toEqual({ kind: 'focusNext' });
    expect(resolveTreeKeyAction('ArrowUp', NESTED_LEAF)).toEqual({ kind: 'focusPrevious' });
  });

  describe('ArrowRight', () => {
    it('opens a closed branch rather than moving past it', () => {
      // Two steps in one key, in the order the WAI-ARIA pattern specifies. A
      // press that both expanded and descended would skip the node just
      // revealed.
      expect(resolveTreeKeyAction('ArrowRight', COLLAPSED_BRANCH)).toEqual({ kind: 'expand' });
    });

    it('descends into a branch that is already open', () => {
      expect(resolveTreeKeyAction('ArrowRight', EXPANDED_BRANCH)).toEqual({ kind: 'focusNext' });
    });

    it('does nothing on a leaf', () => {
      // Not `focusNext`: on a leaf, Right would otherwise jump to an unrelated
      // sibling's subtree, which reads as the cursor teleporting.
      expect(resolveTreeKeyAction('ArrowRight', NESTED_LEAF)).toEqual({ kind: 'none' });
    });
  });

  describe('ArrowLeft', () => {
    it('closes an open branch rather than leaving it', () => {
      expect(resolveTreeKeyAction('ArrowLeft', EXPANDED_BRANCH)).toEqual({ kind: 'collapse' });
    });

    it('steps out to the parent once there is nothing left to close', () => {
      expect(resolveTreeKeyAction('ArrowLeft', COLLAPSED_BRANCH)).toEqual({ kind: 'focusParent' });
      expect(resolveTreeKeyAction('ArrowLeft', NESTED_LEAF)).toEqual({ kind: 'focusParent' });
    });

    it('does nothing on a root leaf, which has nowhere further out to go', () => {
      expect(resolveTreeKeyAction('ArrowLeft', ROOT_LEAF)).toEqual({ kind: 'none' });
    });
  });

  it('jumps to the ends on Home and End', () => {
    expect(resolveTreeKeyAction('Home', NESTED_LEAF)).toEqual({ kind: 'focusFirst' });
    expect(resolveTreeKeyAction('End', NESTED_LEAF)).toEqual({ kind: 'focusLast' });
  });

  it('treats a printable character as typeahead, lowercased', () => {
    expect(resolveTreeKeyAction('P', NESTED_LEAF)).toEqual({ kind: 'typeahead', character: 'p' });
  });

  it('leaves named keys and space alone', () => {
    // Space would otherwise be swallowed as a typeahead for a unit named " ",
    // and named keys belong to the browser or the row's own controls.
    expect(resolveTreeKeyAction(' ', NESTED_LEAF)).toEqual({ kind: 'none' });
    expect(resolveTreeKeyAction('Tab', NESTED_LEAF)).toEqual({ kind: 'none' });
    expect(resolveTreeKeyAction('Escape', NESTED_LEAF)).toEqual({ kind: 'none' });
    expect(resolveTreeKeyAction('PageDown', NESTED_LEAF)).toEqual({ kind: 'none' });
  });
});
