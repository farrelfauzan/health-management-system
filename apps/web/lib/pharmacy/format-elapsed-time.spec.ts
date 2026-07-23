import { describe, expect, it } from 'vitest';

import { formatElapsedTime } from './format-elapsed-time';

const NOW = new Date('2026-07-23T12:00:00.000Z');

describe('formatElapsedTime', () => {
  it('renders sub-minute ages as "Just now"', () => {
    expect(formatElapsedTime('2026-07-23T11:59:30.000Z', NOW)).toBe('Just now');
  });

  it('renders minute ages', () => {
    expect(formatElapsedTime('2026-07-23T11:48:00.000Z', NOW)).toBe('12 min ago');
  });

  it('renders hour and minute ages', () => {
    expect(formatElapsedTime('2026-07-23T10:48:00.000Z', NOW)).toBe('1h 12m ago');
    expect(formatElapsedTime('2026-07-23T09:00:00.000Z', NOW)).toBe('3h ago');
  });

  it('renders day ages beyond 24 hours', () => {
    expect(formatElapsedTime('2026-07-21T09:00:00.000Z', NOW)).toBe('2d ago');
  });

  it('clamps future timestamps to "Just now"', () => {
    expect(formatElapsedTime('2026-07-23T12:05:00.000Z', NOW)).toBe('Just now');
  });
});
