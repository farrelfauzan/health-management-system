import { describe, expect, it } from 'vitest';

import { buildDashboardGreeting } from './greeting';

describe('buildDashboardGreeting', () => {
  it('greets with good morning before noon', () => {
    const actualGreeting = buildDashboardGreeting({
      displayName: 'Dr. Vance',
      facilityName: 'Saling Jaga',
      date: new Date('2026-07-21T09:00:00'),
    });

    expect(actualGreeting).toBe(
      "Good morning, Dr. Vance. Here's what's happening today at Saling Jaga.",
    );
  });

  it('greets with good afternoon between noon and 6 PM', () => {
    const actualGreeting = buildDashboardGreeting({
      displayName: 'Dr. Vance',
      facilityName: 'Saling Jaga',
      date: new Date('2026-07-21T13:30:00'),
    });

    expect(actualGreeting).toContain('Good afternoon');
  });

  it('greets with good evening from 6 PM onward', () => {
    const actualGreeting = buildDashboardGreeting({
      displayName: 'Dr. Vance',
      facilityName: 'Saling Jaga',
      date: new Date('2026-07-21T19:00:00'),
    });

    expect(actualGreeting).toContain('Good evening');
  });
});
