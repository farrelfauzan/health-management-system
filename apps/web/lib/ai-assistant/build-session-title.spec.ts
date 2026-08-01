import { describe, expect, it } from 'vitest';

import { buildSessionTitle } from './build-session-title';

describe('buildSessionTitle', () => {
  it('uses the first message as written when it is short enough', () => {
    const actual = buildSessionTitle('Jam berapa klinik buka?');

    expect(actual).toBe('Jam berapa klinik buka?');
  });

  it('collapses the whitespace a pasted question carries', () => {
    const actual = buildSessionTitle('  Jam berapa\n\n  klinik buka?  ');

    expect(actual).toBe('Jam berapa klinik buka?');
  });

  it('truncates a long question to a title that fits a sidebar row', () => {
    const inputMessage = 'a'.repeat(200);

    const actual = buildSessionTitle(inputMessage);

    // 80 characters, the last of which marks that there is more.
    expect(actual).toHaveLength(80);
    expect(actual?.endsWith('…')).toBe(true);
  });

  it('omits the title entirely for an empty message', () => {
    // The API rejects a blank string, so the field has to be absent rather
    // than present and empty.
    expect(buildSessionTitle('   ')).toBeUndefined();
  });
});
