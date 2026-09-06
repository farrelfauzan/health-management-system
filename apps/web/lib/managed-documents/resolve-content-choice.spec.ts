import { describe, expect, it } from 'vitest';

import { resolveContentChoice } from './resolve-content-choice';

describe('resolveContentChoice', () => {
  it('shows nothing before a type is chosen', () => {
    expect(resolveContentChoice(null, 'upload')).toBeNull();
  });

  it('fixes the control for DRAFTED and UPLOADED whatever was picked', () => {
    expect(resolveContentChoice('DRAFTED', 'upload')).toBe('draft');
    expect(resolveContentChoice('UPLOADED', 'draft')).toBe('upload');
  });

  it('lets the drafter choose on EITHER', () => {
    expect(resolveContentChoice('EITHER', 'draft')).toBe('draft');
    expect(resolveContentChoice('EITHER', 'upload')).toBe('upload');
  });
});
