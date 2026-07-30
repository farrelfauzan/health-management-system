import { describe, expect, it } from 'vitest';

import { formatStatusLabel } from './status-label';

describe('formatStatusLabel', () => {
  it('uses a normalized localized label when one is available', () => {
    expect(formatStatusLabel('in-progress', 'id', { in_progress: 'Sedang berlangsung' })).toBe(
      'Sedang berlangsung',
    );
  });

  it('formats unknown statuses without requiring request context', () => {
    expect(formatStatusLabel('something_unknown', 'en')).toBe('SOMETHING UNKNOWN');
  });
});
