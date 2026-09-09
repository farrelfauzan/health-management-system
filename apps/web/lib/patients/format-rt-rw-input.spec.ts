import { describe, expect, it } from 'vitest';

import { formatRtRwInput } from './format-rt-rw-input';

describe('formatRtRwInput', () => {
  it('inserts the slash once three digits have been typed', () => {
    expect(formatRtRwInput('0')).toBe('0');
    expect(formatRtRwInput('003')).toBe('003');
    expect(formatRtRwInput('0030')).toBe('003/0');
    expect(formatRtRwInput('003007')).toBe('003/007');
  });

  it('keeps a slash the person typed themselves, so a short RT is possible', () => {
    expect(formatRtRwInput('3/')).toBe('3/');
    expect(formatRtRwInput('3/7')).toBe('3/7');
    expect(formatRtRwInput('03/07')).toBe('03/07');
  });

  it('leaves a trailing slash alone while the second half is being deleted', () => {
    expect(formatRtRwInput('003/')).toBe('003/');
  });

  it('drops anything that is not a digit or the separator', () => {
    expect(formatRtRwInput('RT 003 RW 007')).toBe('003/007');
  });

  it('keeps at most three digits either side of a pasted run of digits', () => {
    expect(formatRtRwInput('00030007')).toBe('000/300');
  });

  it('keeps at most three digits either side of a pasted separated value', () => {
    expect(formatRtRwInput('0003/0007')).toBe('000/300');
  });
});
