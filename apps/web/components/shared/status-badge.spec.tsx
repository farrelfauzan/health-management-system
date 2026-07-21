import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatusBadge } from './status-badge';

const EXPECTED_TONE_BY_STATUS: Array<[string, string]> = [
  ['confirmed', 'success'],
  ['completed', 'success'],
  ['out-patient', 'success'],
  ['arrived', 'info'],
  ['in-progress', 'info'],
  ['in-patient', 'info'],
  ['checked_in', 'info'],
  ['pending', 'warning'],
  ['low-stock', 'warning'],
  ['cancelled', 'danger'],
  ['stat', 'danger'],
  ['urgent', 'danger'],
  ['regular', 'neutral'],
  ['discharged', 'neutral'],
  ['SOMETHING_UNKNOWN', 'neutral'],
];

describe('StatusBadge', () => {
  it.each(EXPECTED_TONE_BY_STATUS)('maps status "%s" to the %s tone', (status, expectedTone) => {
    render(<StatusBadge status={status} />);

    const badge = screen.getByText(status.replace(/[_-]+/g, ' ').toUpperCase());
    expect(badge).toHaveAttribute('data-tone', expectedTone);
  });

  it('renders as a pill with the tinted tone classes', () => {
    render(<StatusBadge status="pending" />);

    const badge = screen.getByText('PENDING');
    expect(badge.className).toContain('rounded-full');
    expect(badge.className).toContain('bg-warning-tint');
    expect(badge.className).toContain('text-warning');
  });
});
