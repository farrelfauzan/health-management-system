import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import { StatusBadge } from './status-badge';
import enMessages from '../../messages/en/shared.json';
import idMessages from '../../messages/id/shared.json';

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
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <StatusBadge status={status} />
      </NextIntlClientProvider>,
    );

    const normalizedStatus = status.toLowerCase().replace(/-/g, '_');
    const expectedLabel =
      enMessages.shared.statuses[normalizedStatus as keyof typeof enMessages.shared.statuses] ??
      status.replace(/[_-]+/g, ' ').toUpperCase();
    const badge = screen.getByText(expectedLabel);
    expect(badge).toHaveAttribute('data-tone', expectedTone);
  });

  it('renders as a pill with the tinted tone classes', () => {
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <StatusBadge status="pending" />
      </NextIntlClientProvider>,
    );

    const badge = screen.getByText('PENDING');
    expect(badge.className).toContain('rounded-full');
    expect(badge.className).toContain('bg-warning-tint');
    expect(badge.className).toContain('text-warning');
  });

  it('uses the localized status label unless an explicit label is provided', () => {
    const { rerender } = render(
      <NextIntlClientProvider locale="id" messages={idMessages}>
        <StatusBadge status="in-progress" />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText('SEDANG BERLANGSUNG')).toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="id" messages={idMessages}>
        <StatusBadge status="in-progress" label="Kustom" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText('Kustom')).toBeInTheDocument();
  });
});
